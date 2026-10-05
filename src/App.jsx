import { useMemo, useState } from 'react'
import { Bike, Check, ChevronDown, ClipboardCheck, Dumbbell, Lock, Plus, RefreshCw, RotateCcw, Settings2, Sparkles, Trash2, Unlock, X } from 'lucide-react'
import { DAYS, generateWeeklyPlan } from './planner/generatePlan.js'
import { getTotals, getValidationIssues, validatePlan } from './planner/validator.js'
import { getCompletedTotals, reviewRemainingWeek } from './planner/reviewPlan.js'

const initialPreferences = {
  workFromHomeDays: ['Tuesday', 'Thursday'], busyDays: ['Wednesday'], unavailableDays: [],
  runningMinKm: 58, runningPreferredKm: 60, runningMaxKm: 62,
  cyclingMinKm: 70, cyclingPreferredKm: 80, cyclingMaxKm: 90, strengthSessions: 4,
  previousRunningKm: 60, previousCyclingKm: 80, previousLongRunKm: 24,
  includeSpeedSession: false, includeLegSession: false, includeCoreSession: true,
  allowWeekdayDoubles: true,
  preferredLongRunDay: 'Saturday', preferredLongRideDay: 'Tuesday', previousWeekFatigue: 'normal',
  restDay: null,
}

const icons = { running: '🏃', cycling: '🚴', strength: '🏋️' }

function DayPicker({ label, value, onChange }) {
  return <div>
    <p className="mb-2 text-sm font-medium text-stone-700">{label}</p>
    <div className="flex flex-wrap gap-1.5">
      {DAYS.map((day) => {
        const active = value.includes(day)
        return <button key={day} onClick={() => onChange(active ? value.filter((item) => item !== day) : [...value, day])}
          className={`h-8 w-8 rounded-full text-xs font-semibold transition ${active ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-600 hover:border-stone-500'}`}>{day[0]}</button>
      })}
    </div>
  </div>
}

function NumberField({ label, value, suffix, onChange }) {
  return <label className="block">
    <span className="mb-1.5 block text-sm font-medium text-stone-700">{label}</span>
    <div className="flex items-center rounded-lg border border-stone-300 bg-white px-3 focus-within:ring-2 focus-within:ring-emerald-500">
      <input className="min-w-0 flex-1 bg-transparent py-2 text-sm font-semibold" type="number" min="0" value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="text-xs text-stone-400">{suffix}</span>
    </div>
  </label>
}

function Toggle({ label, checked, onChange }) {
  return <button onClick={() => onChange(!checked)} className="flex w-full items-center justify-between py-1 text-sm text-stone-700">
    <span>{label}</span><span className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-emerald-600' : 'bg-stone-300'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-5.5 translate-x-0' : 'left-0.5'}`} style={{ left: checked ? 22 : 2 }} /></span>
  </button>
}

function App() {
  const [preferences, setPreferences] = useState(initialPreferences)
  const [plan, setPlan] = useState(() => generateWeeklyPlan(initialPreferences))
  const set = (key, value) => setPreferences((current) => ({ ...current, [key]: value }))
  const effectivePreferencesFor = (basePlan = plan) => {
    const effective = { ...preferences }
    const runningMin = Math.min(preferences.runningMinKm, preferences.runningMaxKm)
    if (basePlan.targets?.running < runningMin) {
      effective.runningMinKm = Math.max(0, basePlan.targets.running - 2)
      effective.runningMaxKm = basePlan.targets.running + 2
    }
    if (basePlan.targets?.cycling < preferences.cyclingMinKm) {
      effective.cyclingMinKm = Math.max(0, basePlan.targets.cycling - 5)
      effective.cyclingMaxKm = basePlan.targets.cycling + 5
    }
    return effective
  }
  const revalidate = (days, basePlan = plan) => {
    const effectivePreferences = effectivePreferencesFor(basePlan)
    const validation = validatePlan(days, effectivePreferences)
    return { ...basePlan, days, totals: getTotals(days), validation, effectivePreferences, note: basePlan.note?.replace('This combination of targets and availability is not feasible within the session safety limits. Adjust the targets or availability rather than overloading a workout.', '').trim() }
  }
  const generate = () => {
    let next = generateWeeklyPlan(preferences)
    const locked = plan.days.flatMap((day) => day.workouts.filter((workout) => workout.locked || workout.completed).map((workout) => ({ day: day.day, workout })))
    for (const item of locked) {
      const target = next.days.find((day) => day.day === item.day)
      if (!target || target.capacity === 0) continue
      const replaceIndex = target.workouts.findIndex((workout) => workout.activity === item.workout.activity)
      if (replaceIndex >= 0) target.workouts[replaceIndex] = { ...item.workout }
      else if (target.workouts.length < target.capacity) target.workouts.push({ ...item.workout })
    }
    next = revalidate(next.days, next)
    setPlan(next)
  }
  const updateWorkout = (dayName, workoutId, changes) => {
    const days = structuredClone(plan.days)
    const workout = days.find((day) => day.day === dayName)?.workouts.find((item) => item.id === workoutId)
    if (workout) Object.assign(workout, changes)
    setPlan(revalidate(days))
  }
  const removeWorkout = (dayName, workoutId) => {
    const days = structuredClone(plan.days)
    const day = days.find((item) => item.day === dayName)
    day.workouts = day.workouts.filter((workout) => workout.id !== workoutId)
    setPlan(revalidate(days))
  }
  const moveWorkout = (fromDay, workoutId, toDay) => {
    if (fromDay === toDay) return
    const days = structuredClone(plan.days)
    const source = days.find((day) => day.day === fromDay)
    const target = days.find((day) => day.day === toDay)
    if (!target || target.workouts.length >= target.capacity) return
    const index = source.workouts.findIndex((workout) => workout.id === workoutId)
    if (index >= 0) target.workouts.push(source.workouts.splice(index, 1)[0])
    setPlan(revalidate(days))
  }
  const addWorkout = (dayName, activity) => {
    const days = structuredClone(plan.days)
    const day = days.find((item) => item.day === dayName)
    if (day.workouts.length >= day.capacity) return
    const additions = {
      running: { activity: 'running', name: 'Easy run', distanceKm: 5, durationMinutes: 30, startPeriod: 'Morning', intensity: 'easy', tags: [] },
      cycling: { activity: 'cycling', name: 'Easy spin', distanceKm: 10, durationMinutes: 25, startPeriod: 'Evening', intensity: 'easy', tags: ['Recovery'] },
      strength: { activity: 'strength', name: 'Core', durationMinutes: 25, startPeriod: 'Evening', intensity: 'easy', tags: ['Core'] },
    }
    day.workouts.push({ id: crypto.randomUUID(), ...additions[activity], actualDistanceKm: null, completed: false, locked: false })
    setPlan(revalidate(days))
  }
  const setCompletion = (dayName, workoutId, completed, actualDistanceKm) => {
    const days = structuredClone(plan.days)
    const workout = days.find((day) => day.day === dayName)?.workouts.find((item) => item.id === workoutId)
    if (!workout) return
    workout.completed = completed
    workout.actualDistanceKm = completed && workout.distanceKm != null
      ? Number(actualDistanceKm ?? workout.actualDistanceKm ?? workout.distanceKm)
      : null
    const reviewed = reviewRemainingWeek(days, effectivePreferencesFor(plan), plan.targets)
    setPlan({ ...revalidate(reviewed.days), review: reviewed.review })
  }
  const runWeeklyReview = () => {
    const reviewed = reviewRemainingWeek(plan.days, effectivePreferencesFor(plan), plan.targets)
    setPlan({ ...revalidate(reviewed.days), review: reviewed.review })
  }
  const validCount = useMemo(() => Object.values(plan.validation).filter(Boolean).length, [plan])
  const validationIssues = useMemo(() => getValidationIssues(plan.validation), [plan])
  const completedTotals = useMemo(() => getCompletedTotals(plan.days), [plan.days])

  return <div className="min-h-screen">
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-8">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Training Lab</p><h1 className="text-xl font-bold">Weekly fitness planner</h1></div>
        <button onClick={generate} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"><Sparkles size={16} /> Generate plan</button>
      </div>
    </header>

    <main className="mx-auto grid max-w-[1500px] gap-6 px-5 py-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-8">
      <aside className="h-fit rounded-xl border border-stone-200 bg-white p-5 lg:sticky lg:top-6">
        <div className="mb-5 flex items-center gap-2"><Settings2 size={18} /><h2 className="font-bold">Plan settings</h2></div>
        <div className="space-y-5">
          <DayPicker label="Work from home" value={preferences.workFromHomeDays} onChange={(v) => set('workFromHomeDays', v)} />
          <DayPicker label="Busy days" value={preferences.busyDays} onChange={(v) => set('busyDays', v)} />
          <DayPicker label="Unavailable" value={preferences.unavailableDays} onChange={(v) => set('unavailableDays', v)} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Run min" value={preferences.runningMinKm} suffix="km" onChange={(v) => set('runningMinKm', v)} />
            <NumberField label="Run preferred" value={preferences.runningPreferredKm} suffix="km" onChange={(v) => set('runningPreferredKm', v)} />
            <NumberField label="Run max" value={preferences.runningMaxKm} suffix="km" onChange={(v) => set('runningMaxKm', v)} />
            <NumberField label="Cycle min" value={preferences.cyclingMinKm} suffix="km" onChange={(v) => set('cyclingMinKm', v)} />
            <NumberField label="Cycle preferred" value={preferences.cyclingPreferredKm} suffix="km" onChange={(v) => set('cyclingPreferredKm', v)} />
            <NumberField label="Cycle max" value={preferences.cyclingMaxKm} suffix="km" onChange={(v) => set('cyclingMaxKm', v)} />
            <NumberField label="Strength" value={preferences.strengthSessions} suffix="sessions" onChange={(v) => set('strengthSessions', v)} />
          </div>
          <div className="border-t border-stone-200 pt-4">
            <p className="mb-1 text-sm font-bold text-stone-700">Previous week completed</p>
            <p className="mb-3 text-xs text-stone-500">Use what you actually completed, not what was planned.</p>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Running" value={preferences.previousRunningKm} suffix="km" onChange={(v) => set('previousRunningKm', v)} />
              <NumberField label="Cycling" value={preferences.previousCyclingKm} suffix="km" onChange={(v) => set('previousCyclingKm', v)} />
              <NumberField label="Long run" value={preferences.previousLongRunKm} suffix="km" onChange={(v) => set('previousLongRunKm', v)} />
            </div>
          </div>
          <div className="space-y-2 border-t border-stone-200 pt-4">
            <Toggle label="Allow weekday doubles" checked={preferences.allowWeekdayDoubles} onChange={(v) => set('allowWeekdayDoubles', v)} />
            <Toggle label="Include speed session" checked={preferences.includeSpeedSession} onChange={(v) => set('includeSpeedSession', v)} />
            <Toggle label="Include leg session" checked={preferences.includeLegSession} onChange={(v) => set('includeLegSession', v)} />
            <Toggle label="Include core work" checked={preferences.includeCoreSession} onChange={(v) => set('includeCoreSession', v)} />
          </div>
          <label className="block border-t border-stone-200 pt-4"><span className="mb-1.5 block text-sm font-medium text-stone-700">Previous week fatigue</span>
            <div className="relative"><select value={preferences.previousWeekFatigue} onChange={(e) => set('previousWeekFatigue', e.target.value)} className="w-full appearance-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select><ChevronDown className="pointer-events-none absolute right-3 top-2.5" size={15} /></div>
          </label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-stone-700">Dedicated rest day</span>
            <div className="relative"><select value={preferences.restDay || ''} onChange={(e) => set('restDay', e.target.value || null)} className="w-full appearance-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold"><option value="">No dedicated rest day</option>{DAYS.map((day) => <option key={day} value={day}>{day}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-2.5" size={15} /></div>
          </label>
          <button onClick={() => { setPreferences(initialPreferences); setPlan(generateWeeklyPlan(initialPreferences)) }} className="flex items-center gap-2 text-sm font-semibold text-stone-500 hover:text-stone-900"><RotateCcw size={15} /> Reset defaults</button>
        </div>
      </aside>

      <section className="min-w-0 space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric icon={<span className="text-lg">🏃</span>} label="Running" value={`${plan.totals.runningKm} / ${preferences.runningMinKm} · ${preferences.runningPreferredKm} · ${preferences.runningMaxKm} km`} progress={plan.totals.runningKm / preferences.runningMaxKm} />
          <Metric icon={<Bike size={19} />} label="Cycling" value={`${plan.totals.cyclingKm} / ${preferences.cyclingMinKm} · ${preferences.cyclingPreferredKm} · ${preferences.cyclingMaxKm} km`} progress={plan.totals.cyclingKm / preferences.cyclingMaxKm} />
          <Metric icon={<Dumbbell size={19} />} label="Strength" value={`${plan.totals.strengthSessions} / ${preferences.strengthSessions} sessions`} progress={plan.totals.strengthSessions / preferences.strengthSessions} />
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><ClipboardCheck size={18} /><div><h2 className="font-bold">Weekly review</h2><p className="text-xs text-stone-500">Updates automatically from actual completed distances.</p></div></div><button onClick={runWeeklyReview} className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold hover:bg-stone-50"><RefreshCw size={13} /> Rebalance</button></div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><p><span className="text-stone-500">Completed running</span><br /><strong>{completedTotals.runningKm} km</strong></p><p><span className="text-stone-500">Completed cycling</span><br /><strong>{completedTotals.cyclingKm} km</strong></p><p><span className="text-stone-500">Completed strength</span><br /><strong>{completedTotals.strengthSessions} sessions</strong></p></div>
          {plan.review?.latestCompletedDay && <p className="mt-3 text-xs text-stone-500">Remaining unlocked sessions were reviewed after {plan.review.latestCompletedDay}.{(plan.review.runningUnallocatedKm !== 0 || plan.review.cyclingUnallocatedKm !== 0) && ` ${Math.abs(plan.review.runningUnallocatedKm)} running km and ${Math.abs(plan.review.cyclingUnallocatedKm)} cycling km could not be safely redistributed.`}</p>}
          {plan.review?.adjustments?.length > 0 && <div className="mt-3 rounded-lg bg-emerald-50 p-3"><p className="mb-1 text-xs font-bold text-emerald-800">Adjusted later sessions</p>{plan.review.adjustments.map((item) => <p key={`${item.workoutId}-${item.after}`} className="text-xs text-emerald-800">{item.day}: {item.name} {item.before} → {item.after} km</p>)}</div>}
        </div>

        {plan.note && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{plan.note}</div>}
        {validationIssues.length > 0 && <div className="rounded-lg border border-rose-200 bg-rose-50 p-4"><p className="mb-2 text-sm font-bold text-rose-900">Why this plan needs review</p><ul className="space-y-1 text-sm text-rose-800">{validationIssues.map((issue) => <li key={issue}>• {issue}</li>)}</ul></div>}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {plan.days.map((day) => <article key={day.day} className="min-h-56 rounded-xl border border-stone-200 bg-white p-4 last:xl:col-start-2">
            <div className="mb-4"><h3 className="font-bold">{day.day}</h3><p className="text-xs font-semibold uppercase tracking-wide text-stone-400">{day.type} · {day.workouts.length}/{day.capacity}</p></div>
            <div className="space-y-2">
              {day.workouts.length === 0 ? <div className="rounded-lg border border-dashed border-stone-300 px-3 py-6 text-center text-sm text-stone-400">Rest day</div> : day.workouts.map((workout) => <div key={workout.id} className={`group rounded-lg border p-3 ${workout.locked ? 'border-emerald-300 bg-emerald-50' : 'border-stone-200 bg-stone-50'}`}>
                <div className="flex items-start justify-between gap-2"><div className="flex gap-2"><span>{icons[workout.activity]}</span><div><p className="text-sm font-bold">{workout.name}</p><p className="text-xs text-stone-500">{workout.startPeriod || 'Flexible'} · {workout.durationMinutes} min</p></div></div><div className="flex gap-1"><button onClick={() => updateWorkout(day.day, workout.id, { locked: !workout.locked })} title={workout.locked ? 'Unlock' : 'Lock'} className="p-1 text-stone-400 hover:text-stone-900">{workout.locked ? <Lock size={13} /> : <Unlock size={13} />}</button><button onClick={() => removeWorkout(day.day, workout.id)} title="Remove" className="p-1 text-stone-400 hover:text-rose-600"><Trash2 size={13} /></button></div></div>
                <div className="mt-2 flex gap-2">{workout.distanceKm != null && <label className="flex items-center gap-1 text-xs text-stone-500">Planned <input type="number" min="1" disabled={workout.completed} value={workout.distanceKm} onChange={(e) => updateWorkout(day.day, workout.id, { distanceKm: Number(e.target.value), durationMinutes: Math.round(Number(e.target.value) * (workout.activity === 'running' ? 6 : 2.5)) })} className="w-14 rounded border border-stone-300 bg-white px-1.5 py-1 disabled:bg-stone-100" /> km</label>}<select value={day.day} onChange={(e) => moveWorkout(day.day, workout.id, e.target.value)} className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-1.5 py-1 text-xs">{DAYS.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
                <div className="mt-2 rounded border border-stone-200 bg-white p-2"><label className="flex items-center gap-2 text-xs font-semibold text-stone-600"><input type="checkbox" checked={Boolean(workout.completed)} onChange={(e) => setCompletion(day.day, workout.id, e.target.checked)} /> Completed</label>{workout.completed && workout.distanceKm != null && <label className="mt-2 flex items-center gap-2 text-xs text-stone-500">Actual <input type="number" min="0" value={workout.actualDistanceKm ?? workout.distanceKm} onChange={(e) => setCompletion(day.day, workout.id, true, e.target.value)} className="w-16 rounded border border-stone-300 px-1.5 py-1" /> km</label>}</div>
                <div className="mt-2 flex gap-1"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${workout.intensity === 'hard' ? 'bg-rose-100 text-rose-700' : workout.intensity === 'easy' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>{workout.intensity}</span>{workout.tags?.map((tag) => <span key={tag} className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-stone-600">{tag}</span>)}</div>
              </div>)}
            </div>
            {day.workouts.length < day.capacity && <div className="mt-3 flex flex-wrap gap-1"><span className="mr-1 flex items-center text-[10px] font-bold uppercase text-stone-400"><Plus size={11} /></span>{[['running', 'Run'], ['cycling', 'Ride'], ['strength', 'Core']].map(([activity, label]) => <button key={activity} onClick={() => addWorkout(day.day, activity)} className="rounded border border-stone-200 bg-white px-2 py-1 text-[10px] font-semibold text-stone-600 hover:border-stone-400">{label}</button>)}</div>}
          </article>)}
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Constraint check</h2><p className="text-sm text-stone-500">{validCount} of {Object.keys(plan.validation).length} checks passed</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${validCount === Object.keys(plan.validation).length ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{validCount === Object.keys(plan.validation).length ? 'Valid plan' : 'Needs review'}</span></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(plan.validation).map(([key, passed]) => <div key={key} className="flex items-center gap-2 text-sm"><span className={`grid h-5 w-5 place-items-center rounded-full ${passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{passed ? <Check size={12} /> : <X size={12} />}</span><span className="capitalize text-stone-600">{key.replace(/([A-Z])/g, ' $1')}</span></div>)}</div>
        </div>
      </section>
    </main>
  </div>
}

function Metric({ icon, label, value, progress }) {
  return <div className="rounded-xl border border-stone-200 bg-white p-4"><div className="mb-3 flex items-center gap-2 text-stone-500">{icon}<span className="text-xs font-bold uppercase tracking-wide">{label}</span></div><p className="mb-3 text-lg font-bold">{value}</p><div className="h-1.5 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, progress * 100)}%` }} /></div></div>
}

export default App
