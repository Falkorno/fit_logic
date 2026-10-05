import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Activity, BarChart3, Bike, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardCheck, Cloud, CloudOff, Copy, Dumbbell, Footprints, ListTodo, Lock, LogIn, LogOut, Pencil, Plus, RefreshCw, RotateCcw, Settings2, Sparkles, Target, Trash2, TrendingUp, Undo2, Unlock, X } from 'lucide-react'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { DAYS, generateWeeklyPlan } from './planner/generatePlan.js'
import { getTotals, validatePlan } from './planner/validator.js'
import { getCompletedTotals, reviewRemainingWeek } from './planner/reviewPlan.js'
import type { ActivityType, DayName, PlanDay, Preferences, WeeklyPlan, Workout } from './planner/types.js'
import { auth, firebaseEnabled, signInWithGoogle, signOutFirebase } from './lib/firebase.js'
import { saveFitnessState, subscribeToFitnessState } from './lib/fitnessStore.js'

const initialPreferences: Preferences = {
  workFromHomeDays: ['Tuesday', 'Thursday'], busyDays: ['Wednesday'], unavailableDays: [],
  runningMinKm: 58, runningPreferredKm: 60, runningMaxKm: 62,
  cyclingMinKm: 70, cyclingPreferredKm: 80, cyclingMaxKm: 90, strengthSessions: 4,
  previousRunningKm: 60, previousCyclingKm: 80, previousLongRunKm: 24,
  includeSpeedSession: false, includeLegSession: false, includeCoreSession: true,
  allowWeekdayDoubles: true,
  preferredLongRunDay: 'Saturday', preferredLongRideDay: 'Tuesday', previousWeekFatigue: 'normal',
  restDay: null,
}

const strengthOptions = [
  { name: 'Back & biceps', durationMinutes: 55 },
  { name: 'Chest & triceps', durationMinutes: 55 },
  { name: 'Legs', durationMinutes: 55 },
  { name: 'Back & chest', durationMinutes: 60 },
  { name: 'Shoulders', durationMinutes: 35 },
  { name: 'Arms', durationMinutes: 40 },
  { name: 'Core', durationMinutes: 25 },
] as const

const activityStyles: Record<ActivityType, { icon: typeof Footprints, className: string }> = {
  running: { icon: Footprints, className: 'bg-violet-100 text-violet-700' },
  cycling: { icon: Bike, className: 'bg-sky-100 text-sky-700' },
  strength: { icon: Dumbbell, className: 'bg-amber-100 text-amber-700' },
}

function ActivityIcon({ activity, size = 15 }: { activity: ActivityType, size?: number }) {
  const config = activityStyles[activity] || activityStyles.running
  const Icon = config.icon
  return <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${config.className}`}><Icon size={size} strokeWidth={2.2} /></span>
}

function DayPicker({ label, value, onChange }: { label: string, value: DayName[], onChange: (value: DayName[]) => void }) {
  return <div>
    <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold text-slate-700">{label}</p><span className="text-[11px] font-medium text-slate-400">{value.length || 'None'} selected</span></div>
    <div className="grid grid-cols-7 gap-1">
      {DAYS.map((day) => {
        const active = value.includes(day)
        return <button key={day} type="button" aria-pressed={active} aria-label={`${day}${active ? ', selected' : ''}`} onClick={() => onChange(active ? value.filter((item) => item !== day) : [...value, day])}
          className={`h-9 rounded-lg text-xs font-bold transition-all ${active ? 'bg-slate-900 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:bg-slate-50'}`}>{day.slice(0, 1)}</button>
      })}
    </div>
  </div>
}

function NumberField({ label, value, suffix, onChange }: { label: string, value: number, suffix: string, onChange: (value: number) => void }) {
  return <label className="block">
    <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
    <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3 shadow-sm transition focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
      <input className="min-w-0 flex-1 bg-transparent py-2.5 text-sm font-bold text-slate-900" type="number" min="0" value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="text-[11px] font-medium text-slate-400">{suffix}</span>
    </div>
  </label>
}

function Toggle({ label, checked, onChange }: { label: string, checked: boolean, onChange: (value: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between rounded-lg py-1.5 text-sm font-medium text-slate-700">
    <span>{label}</span><span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-emerald-600' : 'bg-slate-300'}`}><span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform" style={{ transform: `translateX(${checked ? 22 : 2}px)` }} /></span>
  </button>
}

function isoDate(date: Date): string {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getTimezoneOffset() * 0)
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
}

function mondayFor(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return monday
}

function dateFromIso(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function CalendarView({ plans, month, onMonthChange }: { plans: WeeklyPlan[], month: Date, onMonthChange: (month: Date) => void }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstDayOffset = (new Date(year, monthIndex, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((firstDayOffset + daysInMonth) / 7) * 7 }, (_, index) => {
    const dayNumber = index - firstDayOffset + 1
    return dayNumber > 0 && dayNumber <= daysInMonth ? new Date(year, monthIndex, dayNumber) : null
  })
  const now = new Date()
  const workoutsByDate = new Map<string, Workout[]>()
  for (const plan of plans) {
    const weekStart = dateFromIso(plan.weekStart)
    plan.days.forEach((day, index) => {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + index)
      workoutsByDate.set(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`, day.workouts)
    })
  }
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
  const selectedKey = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`
  const selectedWorkouts = workoutsByDate.get(selectedKey) || []
  const changeMonth = (delta: number) => onMonthChange(new Date(year, monthIndex + delta, 1))

  return <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-5">
    <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Training calendar</p><h2 className="text-xl font-bold tracking-tight text-slate-950">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2></div><div className="flex items-center rounded-xl border border-slate-200 bg-white p-1"><button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><ChevronLeft size={18} /></button><button type="button" onClick={() => onMonthChange(new Date())} className="h-9 px-2 text-xs font-bold text-slate-600 hover:text-slate-950">Today</button><button type="button" onClick={() => changeMonth(1)} aria-label="Next month" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><ChevronRight size={18} /></button></div></div>
    <div className="grid grid-cols-7 border-b border-slate-200">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <div key={`${day}-${index}`} className="py-2 text-center text-[11px] font-bold text-slate-400">{day}</div>)}</div>
    <div className="grid grid-cols-7 overflow-hidden rounded-b-xl border-l border-slate-200">
      {cells.map((date, index) => {
        if (!date) return <div key={`empty-${index}`} className="min-h-16 border-b border-r border-slate-200 bg-slate-50/40 sm:min-h-20" />
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
        const workouts = workoutsByDate.get(key) || []
        const isToday = key === todayKey
        const selected = key === selectedKey
        return <button type="button" onClick={() => setSelectedDate(date)} key={key} aria-label={`${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${workouts.length} activities`} className={`relative flex min-h-16 items-center justify-center border-b border-r border-slate-200 p-1.5 text-center transition sm:min-h-20 sm:p-2 ${selected ? 'bg-slate-50 ring-2 ring-inset ring-emerald-500' : isToday ? 'bg-emerald-50/50 hover:bg-emerald-50' : 'bg-white hover:bg-slate-50'}`}><span className={`absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold sm:left-2 sm:top-2 ${isToday ? 'bg-emerald-600 text-white' : 'text-slate-700'}`}>{date.getDate()}</span><div className="mt-4 flex h-4 items-center justify-center -space-x-1.5">{workouts.map((workout, workoutIndex) => {
          const colours = workout.activity === 'running'
            ? { complete: 'border-violet-500 bg-violet-500', planned: 'border-violet-400 bg-violet-100' }
            : workout.activity === 'cycling'
              ? { complete: 'border-sky-500 bg-sky-500', planned: 'border-sky-400 bg-sky-100' }
              : { complete: 'border-amber-500 bg-amber-500', planned: 'border-amber-400 bg-amber-100' }
          return <span key={workout.id} title={`${workout.name}${workout.completed ? ' — completed' : ' — planned'}`} className={`relative h-3.5 w-3.5 shrink-0 rounded-full border-2 ring-2 ring-white ${workout.completed ? colours.complete : colours.planned}`} style={{ zIndex: workoutIndex + 1 }} />
        })}</div></button>
      })}
    </div>
    <div className="mt-4 rounded-2xl bg-slate-50 p-3 sm:p-4"><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-semibold text-emerald-700">Selected day</p><h3 className="font-bold text-slate-900">{selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3></div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-500 shadow-sm">{selectedWorkouts.length} {selectedWorkouts.length === 1 ? 'activity' : 'activities'}</span></div>{selectedWorkouts.length === 0 ? <p className="py-3 text-sm text-slate-500">No training planned for this day.</p> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{selectedWorkouts.map((workout) => <div key={workout.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"><ActivityIcon activity={workout.activity} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{workout.name}</p><p className="text-xs text-slate-500">{workout.startPeriod || 'Flexible'} · {workout.durationMinutes} min{workout.distanceKm != null ? ` · ${workout.distanceKm} km` : ''}</p></div><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${workout.completed ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{workout.completed ? <Check size={13} /> : <span className="h-2 w-2 rounded-full bg-slate-300" />}</span></div>)}</div>}</div>
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500"><span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-slate-400 bg-slate-100" /> Outline = planned</span><span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-slate-700" /> Solid = completed</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" /> Run</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Ride</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Strength</span></div>
  </div>
}

function ProgressView({ plans }: { plans: WeeklyPlan[] }) {
  const weeks = [...plans].sort((a, b) => a.weekStart.localeCompare(b.weekStart))
  const rows = weeks.map((plan) => {
    const workouts = plan.days.flatMap((day) => day.workouts)
    const completed = workouts.filter((workout) => workout.completed)
    const totals = getCompletedTotals(plan.days)
    return { plan, workoutCount: workouts.length, completedCount: completed.length, totals, completion: workouts.length ? Math.round(completed.length / workouts.length * 100) : 0 }
  })
  const totalWorkouts = rows.reduce((sum, row) => sum + row.workoutCount, 0)
  const totalCompleted = rows.reduce((sum, row) => sum + row.completedCount, 0)
  const completionRate = totalWorkouts ? Math.round(totalCompleted / totalWorkouts * 100) : 0
  const completedRun = rows.reduce((sum, row) => sum + row.totals.runningKm, 0)
  const completedRide = rows.reduce((sum, row) => sum + row.totals.cyclingKm, 0)

  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><InsightCard icon={<Target size={18} />} label="Completion rate" value={`${completionRate}%`} detail={`${totalCompleted} of ${totalWorkouts} workouts`} /><InsightCard icon={<Footprints size={18} />} label="Running completed" value={`${completedRun} km`} detail={`Across ${weeks.length} ${weeks.length === 1 ? 'week' : 'weeks'}`} /><InsightCard icon={<Bike size={18} />} label="Cycling completed" value={`${completedRide} km`} detail="Actual recorded distance" /><InsightCard icon={<TrendingUp size={18} />} label="Active weeks" value={`${rows.filter((row) => row.completedCount > 0).length}`} detail={`${weeks.length} weeks planned`} /></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-5"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Weekly consistency</p><h2 className="text-xl font-bold tracking-tight">Planned vs completed</h2></div><div className="space-y-4">{rows.map((row) => <div key={row.plan.weekStart} className="grid gap-2 sm:grid-cols-[130px_minmax(0,1fr)_70px] sm:items-center"><div><p className="text-sm font-bold text-slate-800">Week of {dateFromIso(row.plan.weekStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p><p className="text-xs text-slate-400">{row.completedCount}/{row.workoutCount} sessions</p></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400" style={{ width: `${row.completion}%` }} /></div><span className="text-right text-sm font-bold text-slate-700">{row.completion}%</span></div>)}</div></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><h2 className="mb-4 font-bold tracking-tight">Completed volume by week</h2><div className="grid gap-3 sm:grid-cols-2">{rows.map((row) => <div key={row.plan.weekStart} className="rounded-xl bg-slate-50 p-3"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{dateFromIso(row.plan.weekStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p><div className="flex items-center justify-between text-sm"><span className="text-violet-700">Run <strong>{row.totals.runningKm} km</strong></span><span className="text-sky-700">Ride <strong>{row.totals.cyclingKm} km</strong></span><span className="text-amber-700">Strength <strong>{row.totals.strengthSessions}</strong></span></div></div>)}</div></div>
  </div>
}

function InsightCard({ icon, label, value, detail }: { icon: ReactNode, label: string, value: string, detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center gap-2 text-emerald-700">{icon}<span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span></div><p className="text-2xl font-bold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div>
}

function App() {
  const [preferences, setPreferences] = useState(initialPreferences)
  const initialWeekStart = useMemo(() => isoDate(mondayFor(new Date())), [])
  const [activeWeekStart, setActiveWeekStart] = useState(initialWeekStart)
  const [plan, setPlan] = useState<WeeklyPlan>(() => generateWeeklyPlan(initialPreferences, initialWeekStart))
  const [history, setHistory] = useState<Record<string, WeeklyPlan>>(() => ({ [initialWeekStart]: plan }))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [checksOpen, setChecksOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState(() => DAYS[(new Date().getDay() + 6) % 7])
  const [view, setView] = useState('plan')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [editor, setEditor] = useState<{ originalDay: DayName, day: DayName, workout: Workout } | null>(null)
  const [undoPlan, setUndoPlan] = useState<WeeklyPlan | null>(null)
  const [strengthPickerDay, setStrengthPickerDay] = useState<DayName | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [syncReady, setSyncReady] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'local' | 'loading' | 'saved' | 'error'>(firebaseEnabled ? 'loading' : 'local')

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setSyncReady(false)
      setSyncStatus(nextUser ? 'loading' : 'local')
    })
  }, [])

  useEffect(() => {
    if (!user) return
    return subscribeToFitnessState(user.uid, (cloudState) => {
      if (cloudState) {
        setPreferences(cloudState.preferences)
        setHistory(cloudState.history)
        setActiveWeekStart(cloudState.activeWeekStart)
        const cloudPlan = cloudState.history[cloudState.activeWeekStart]
        if (cloudPlan) setPlan(cloudPlan)
      }
      setSyncReady(true)
      setSyncStatus('saved')
    })
  }, [user])

  useEffect(() => {
    if (!user || !syncReady) return
    setSyncStatus('loading')
    const timer = window.setTimeout(() => {
      saveFitnessState(user.uid, { preferences, history, activeWeekStart })
        .then(() => setSyncStatus('saved'))
        .catch(() => setSyncStatus('error'))
    }, 600)
    return () => window.clearTimeout(timer)
  }, [user, syncReady, preferences, history, activeWeekStart])
  const commitPlan = (next: WeeklyPlan) => {
    setPlan(next)
    setHistory((current) => ({ ...current, [next.weekStart]: next }))
  }
  const changeWeek = (delta: number) => {
    const nextDate = dateFromIso(activeWeekStart)
    nextDate.setDate(nextDate.getDate() + delta * 7)
    const nextStart = isoDate(nextDate)
    const nextPlan = history[nextStart] ?? generateWeeklyPlan(preferences, nextStart)
    setActiveWeekStart(nextStart)
    commitPlan(nextPlan)
    setSelectedDay('Monday')
  }
  const commitEditableChange = (next: WeeklyPlan) => {
    setUndoPlan(structuredClone(plan))
    commitPlan(next)
  }
  const saveEditor = () => {
    if (!editor) return
    const days = structuredClone(plan.days)
    const source = days.find((day) => day.day === editor.originalDay)
    const target = days.find((day) => day.day === editor.day)
    if (!source || !target) return
    const existingIndex = source.workouts.findIndex((workout) => workout.id === editor.workout.id)
    if (existingIndex < 0 || (source !== target && target.workouts.length >= target.capacity)) return
    source.workouts.splice(existingIndex, 1)
    target.workouts.push({ ...editor.workout })
    commitEditableChange(revalidate(days))
    setEditor(null)
  }
  const duplicateEditor = () => {
    if (!editor) return
    const days = structuredClone(plan.days)
    const target = days.find((day) => day.day === editor.day)
    if (!target || target.workouts.length >= target.capacity) return
    target.workouts.push({ ...editor.workout, id: crypto.randomUUID(), name: `${editor.workout.name} copy`, completed: false, actualDistanceKm: null, locked: false })
    commitEditableChange(revalidate(days))
    setEditor(null)
  }
  const set = <Key extends keyof Preferences>(key: Key, value: Preferences[Key]) => setPreferences((current) => ({ ...current, [key]: value }))
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
  const revalidate = (days: PlanDay[], basePlan: WeeklyPlan = plan): WeeklyPlan => {
    const effectivePreferences = effectivePreferencesFor(basePlan)
    const validation = validatePlan(days, effectivePreferences)
    return { ...basePlan, days, totals: getTotals(days), validation, effectivePreferences, note: basePlan.note?.replace('This combination of targets and availability is not feasible within the session safety limits. Adjust the targets or availability rather than overloading a workout.', '').trim() }
  }
  const generate = () => {
    let next = generateWeeklyPlan(preferences, activeWeekStart)
    const locked = plan.days.flatMap((day) => day.workouts.filter((workout) => workout.locked || workout.completed).map((workout) => ({ day: day.day, workout })))
    for (const item of locked) {
      const target = next.days.find((day) => day.day === item.day)
      if (!target || target.capacity === 0) continue
      const replaceIndex = target.workouts.findIndex((workout) => workout.activity === item.workout.activity)
      if (replaceIndex >= 0) target.workouts[replaceIndex] = { ...item.workout }
      else if (target.workouts.length < target.capacity) target.workouts.push({ ...item.workout })
    }
    next = revalidate(next.days, next)
    commitPlan(next)
  }
  const updateWorkout = (dayName: string, workoutId: string, changes: Partial<Workout>) => {
    const days = structuredClone(plan.days)
    const workout = days.find((day) => day.day === dayName)?.workouts.find((item) => item.id === workoutId)
    if (workout) Object.assign(workout, changes)
    commitPlan(revalidate(days))
  }
  const removeWorkout = (dayName: string, workoutId: string) => {
    const days = structuredClone(plan.days)
    const day = days.find((item) => item.day === dayName)
    if (!day) return
    const removed = day.workouts.find((workout) => workout.id === workoutId)
    day.workouts = day.workouts.filter((workout) => workout.id !== workoutId)
    if (removed && (removed.activity === 'running' || removed.activity === 'cycling')) {
      const reviewed = reviewRemainingWeek(days, effectivePreferencesFor(plan), plan.targets, DAYS.indexOf(day.day))
      commitPlan({ ...revalidate(reviewed.days), review: reviewed.review })
      return
    }
    commitPlan(revalidate(days))
  }
  const addWorkout = (dayName: DayName, activity: ActivityType, strengthName = 'Core') => {
    const days = structuredClone(plan.days)
    const day = days.find((item) => item.day === dayName)
    if (!day || day.workouts.length >= day.capacity) return
    const strengthChoice = strengthOptions.find((option) => option.name === strengthName) ?? strengthOptions[strengthOptions.length - 1]
    const additions: Record<ActivityType, Omit<Workout, 'id' | 'actualDistanceKm' | 'completed' | 'locked'>> = {
      running: { activity: 'running', name: 'Easy run', distanceKm: 5, durationMinutes: 30, startPeriod: 'Morning', intensity: 'easy', tags: [] },
      cycling: { activity: 'cycling', name: 'Easy spin', distanceKm: 10, durationMinutes: 25, startPeriod: 'Evening', intensity: 'easy', tags: ['Recovery'] },
      strength: { activity: 'strength', name: strengthChoice.name, durationMinutes: strengthChoice.durationMinutes, startPeriod: 'Evening', intensity: strengthChoice.name === 'Legs' ? 'hard' : 'moderate', tags: strengthChoice.name === 'Core' || strengthChoice.name === 'Legs' ? [strengthChoice.name] : [] },
    }
    day.workouts.push({ id: crypto.randomUUID(), ...additions[activity], actualDistanceKm: null, completed: false, locked: false })
    commitPlan(revalidate(days))
  }
  const setCompletion = (dayName: string, workoutId: string, completed: boolean, actualDistanceKm?: number | string) => {
    const days = structuredClone(plan.days)
    const workout = days.find((day) => day.day === dayName)?.workouts.find((item) => item.id === workoutId)
    if (!workout) return
    workout.completed = completed
    workout.actualDistanceKm = completed && workout.distanceKm != null
      ? Number(actualDistanceKm ?? workout.actualDistanceKm ?? workout.distanceKm)
      : null
    const reviewed = reviewRemainingWeek(days, effectivePreferencesFor(plan), plan.targets)
    commitPlan({ ...revalidate(reviewed.days), review: reviewed.review })
  }
  const runWeeklyReview = () => {
    const reviewed = reviewRemainingWeek(plan.days, effectivePreferencesFor(plan), plan.targets)
    commitPlan({ ...revalidate(reviewed.days), review: reviewed.review })
  }
  const validCount = useMemo(() => Object.values(plan.validation).filter(Boolean).length, [plan])
  const completedTotals = useMemo(() => getCompletedTotals(plan.days), [plan.days])
  const reviewAdjustments = plan.review?.adjustments ?? []
  const weekStartDate = dateFromIso(activeWeekStart)
  const weekEndDate = new Date(weekStartDate)
  weekEndDate.setDate(weekEndDate.getDate() + 6)
  const weekLabel = `${weekStartDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${weekEndDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`

  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.08),_transparent_28rem)]">
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1540px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-200"><Activity size={20} /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700">Training Lab</p><h1 className="text-lg font-bold tracking-tight sm:text-xl">Weekly fitness planner</h1></div></div>
        <div className="flex items-center gap-2">{firebaseEnabled && (user ? <button type="button" onClick={signOutFirebase} title="Sign out" className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50">{syncStatus === 'error' ? <CloudOff size={15} className="text-rose-500" /> : <Cloud size={15} className={syncStatus === 'saved' ? 'text-emerald-600' : 'text-slate-400'} />}<span className="hidden md:inline">{syncStatus === 'saved' ? 'Synced' : syncStatus === 'error' ? 'Sync error' : 'Saving…'}</span><LogOut size={14} /></button> : <button type="button" onClick={() => signInWithGoogle().catch(() => setSyncStatus('error'))} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"><LogIn size={15} /><span className="hidden sm:inline">Sign in</span></button>)}<button onClick={generate} className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md sm:px-4"><Sparkles size={16} /><span className="hidden sm:inline">Generate plan</span><span className="sm:hidden">Generate</span></button></div>
      </div>
    </header>

    <main className={`mx-auto grid max-w-[1540px] gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 ${view === 'plan' ? 'lg:grid-cols-[300px_minmax(0,1fr)]' : 'lg:grid-cols-1'}`}>
      {view === 'plan' && <aside className="h-fit rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 lg:sticky lg:top-24">
        <button type="button" onClick={() => setSettingsOpen((open) => !open)} className="flex w-full items-center gap-3 text-left lg:pointer-events-none"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-700"><Settings2 size={17} /></span><div className="min-w-0 flex-1"><h2 className="font-bold tracking-tight">Plan settings</h2><p className="text-xs text-slate-500">Shape your ideal training week</p></div><span className="text-slate-400 lg:hidden">{settingsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span></button>
        <div className={`${settingsOpen ? 'block' : 'hidden'} mt-5 space-y-5 border-t border-slate-100 pt-5 lg:block`}>
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
            <div className="relative"><select value={preferences.previousWeekFatigue} onChange={(e) => set('previousWeekFatigue', e.target.value as Preferences['previousWeekFatigue'])} className="w-full appearance-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select><ChevronDown className="pointer-events-none absolute right-3 top-2.5" size={15} /></div>
          </label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-stone-700">Dedicated rest day</span>
            <div className="relative"><select value={preferences.restDay || ''} onChange={(e) => set('restDay', (e.target.value || null) as DayName | null)} className="w-full appearance-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold"><option value="">No dedicated rest day</option>{DAYS.map((day) => <option key={day} value={day}>{day}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-2.5" size={15} /></div>
          </label>
          <button onClick={() => { setPreferences(initialPreferences); commitPlan(generateWeeklyPlan(initialPreferences, activeWeekStart)) }} className="flex items-center gap-2 text-sm font-semibold text-stone-500 hover:text-stone-900"><RotateCcw size={15} /> Reset defaults</button>
        </div>
      </aside>}

      <section className="min-w-0 space-y-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="mb-1 text-sm font-semibold text-emerald-700">{view === 'plan' ? weekLabel : 'Training history'}</p><h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{view === 'plan' ? 'Balanced for your goals' : view === 'calendar' ? 'Your training at a glance' : 'Progress and consistency'}</h2><p className="mt-1 max-w-2xl text-sm text-slate-500">{view === 'plan' ? 'Adjust settings, fine-tune individual sessions, and mark workouts complete as you go.' : view === 'calendar' ? 'Planned activities stay muted and become colourful when you complete them.' : 'Compare planned training with what you actually completed each week.'}</p>{view === 'plan' && <div className="mt-3 flex w-fit items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm"><button type="button" onClick={() => changeWeek(-1)} aria-label="Previous week" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><ChevronLeft size={17} /></button><button type="button" onClick={() => { setActiveWeekStart(initialWeekStart); commitPlan(history[initialWeekStart] ?? generateWeeklyPlan(preferences, initialWeekStart)) }} className="h-8 px-2 text-xs font-bold text-slate-600">This week</button><button type="button" onClick={() => changeWeek(1)} aria-label="Next week" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><ChevronRight size={17} /></button></div>}</div>
          <div className="flex w-full items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto"><button type="button" onClick={() => setView('plan')} className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition sm:flex-none sm:text-sm ${view === 'plan' ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><ListTodo size={15} /> Plan</button><button type="button" onClick={() => setView('calendar')} className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition sm:flex-none sm:text-sm ${view === 'calendar' ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><CalendarDays size={15} /> Calendar</button><button type="button" onClick={() => setView('progress')} className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition sm:flex-none sm:text-sm ${view === 'progress' ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><BarChart3 size={15} /> Progress</button></div>
        </div>
        {view === 'calendar' && <CalendarView plans={Object.values(history)} month={calendarMonth} onMonthChange={setCalendarMonth} />}
        {view === 'progress' && <ProgressView plans={Object.values(history)} />}
        {view === 'plan' && <>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
          <Metric icon={<Footprints size={19} />} label="Running" value={`${plan.totals.runningKm} / ${preferences.runningMinKm} · ${preferences.runningPreferredKm} · ${preferences.runningMaxKm} km`} progress={plan.totals.runningKm / preferences.runningMaxKm} />
          <Metric icon={<Bike size={19} />} label="Cycling" value={`${plan.totals.cyclingKm} / ${preferences.cyclingMinKm} · ${preferences.cyclingPreferredKm} · ${preferences.cyclingMaxKm} km`} progress={plan.totals.cyclingKm / preferences.cyclingMaxKm} />
          <Metric icon={<Dumbbell size={19} />} label="Strength" value={`${plan.totals.strengthSessions} / ${preferences.strengthSessions} sessions`} progress={plan.totals.strengthSessions / preferences.strengthSessions} />
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><button type="button" onClick={() => setReviewOpen((open) => !open)} className="flex min-w-0 items-center gap-2 text-left sm:pointer-events-none"><ClipboardCheck size={18} className="shrink-0" /><div className="min-w-0"><h2 className="font-bold">Weekly review</h2><p className="truncate text-xs text-slate-500">{completedTotals.runningKm} km run · {completedTotals.cyclingKm} km ride · {completedTotals.strengthSessions} strength</p></div><span className="ml-1 text-slate-400 sm:hidden">{reviewOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</span></button><button onClick={runWeeklyReview} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50"><RefreshCw size={13} /><span className="hidden min-[380px]:inline">Rebalance</span></button></div>
          <div className={`${reviewOpen ? 'block' : 'hidden'} sm:block`}><div className="mt-4 grid grid-cols-3 gap-2 text-sm"><p className="rounded-xl bg-slate-50 p-2.5"><span className="text-xs text-slate-500">Running</span><br /><strong>{completedTotals.runningKm} km</strong></p><p className="rounded-xl bg-slate-50 p-2.5"><span className="text-xs text-slate-500">Cycling</span><br /><strong>{completedTotals.cyclingKm} km</strong></p><p className="rounded-xl bg-slate-50 p-2.5"><span className="text-xs text-slate-500">Strength</span><br /><strong>{completedTotals.strengthSessions}</strong></p></div>
          {plan.review?.latestCompletedDay && <p className="mt-3 text-xs text-slate-500">Remaining unlocked sessions were reviewed after {plan.review.latestCompletedDay}.{(plan.review.runningUnallocatedKm !== 0 || plan.review.cyclingUnallocatedKm !== 0) && ` ${Math.abs(plan.review.runningUnallocatedKm)} running km and ${Math.abs(plan.review.cyclingUnallocatedKm)} cycling km could not be safely redistributed.`}</p>}
          {reviewAdjustments.length > 0 && <div className="mt-3 rounded-lg bg-emerald-50 p-3"><p className="mb-1 text-xs font-bold text-emerald-800">Adjusted later sessions</p>{reviewAdjustments.map((item) => <p key={`${item.workoutId}-${item.after}`} className="text-xs text-emerald-800">{item.day}: {item.name} {item.before} → {item.after} km</p>)}</div>}</div>
        </div>

        {plan.note && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{plan.note}</div>}
        <div className="md:hidden">
          <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><CalendarDays size={17} className="text-emerald-600" /><h2 className="font-bold tracking-tight">This week</h2></div><span className="text-xs text-slate-400">Tap a day</span></div>
          <div className="grid grid-cols-7 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            {plan.days.map((day) => {
              const active = selectedDay === day.day
              const complete = day.workouts.length > 0 && day.workouts.every((workout) => workout.completed)
              return <button key={day.day} type="button" aria-pressed={active} onClick={() => setSelectedDay(day.day)} className={`relative flex min-h-14 flex-col items-center justify-center rounded-xl px-1 transition ${active ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><span className="text-[10px] font-bold uppercase">{day.day.slice(0, 2)}</span><span className={`mt-1 text-sm font-bold ${active ? 'text-white' : 'text-slate-900'}`}>{day.workouts.length}</span>{complete && <span className={`absolute bottom-1 h-1 w-1 rounded-full ${active ? 'bg-emerald-300' : 'bg-emerald-500'}`} />}</button>
            })}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {plan.days.map((day) => <article key={day.day} className={`${selectedDay === day.day ? 'block' : 'hidden'} min-h-56 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:block last:xl:col-start-2`}>
            <div className="mb-4 flex items-start justify-between"><div><h3 className="font-bold tracking-tight text-slate-900">{day.day}</h3><p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{day.type}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{day.workouts.length}/{day.capacity}</span></div>
            <div className="space-y-2">
              {day.workouts.length === 0 ? <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-6 text-center"><div><span className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-full bg-white text-slate-400 shadow-sm"><Check size={14} /></span><p className="text-sm font-medium text-slate-500">Recovery day</p></div></div> : day.workouts.map((workout) => <div key={workout.id} className={`group rounded-xl border p-3 transition ${workout.locked ? 'border-emerald-200 bg-emerald-50/70' : workout.completed ? 'border-slate-200 bg-slate-50 opacity-75' : 'border-slate-200 bg-white shadow-sm'}`}>
                <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 gap-2.5"><ActivityIcon activity={workout.activity} /><div className="min-w-0"><p className={`truncate text-sm font-bold ${workout.completed ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{workout.name}</p><p className="text-xs text-slate-500">{workout.startPeriod || 'Flexible'} · {workout.durationMinutes} min</p></div></div><div className="flex gap-0.5"><button onClick={() => setEditor({ originalDay: day.day, day: day.day, workout: structuredClone(workout) })} aria-label="Edit workout" title="Edit" className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-900"><Pencil size={13} /></button><button onClick={() => updateWorkout(day.day, workout.id, { locked: !workout.locked })} aria-label={workout.locked ? 'Unlock workout' : 'Lock workout'} title={workout.locked ? 'Unlock' : 'Lock'} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-900">{workout.locked ? <Lock size={13} /> : <Unlock size={13} />}</button><button onClick={() => removeWorkout(day.day, workout.id)} aria-label="Remove workout" title="Remove" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={13} /></button></div></div>
                <div className="mt-3 flex flex-wrap items-center gap-2">{workout.distanceKm != null && <label className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-500"><input aria-label="Planned distance" type="number" min="1" disabled={workout.completed} value={workout.distanceKm} onChange={(e) => updateWorkout(day.day, workout.id, { distanceKm: Number(e.target.value), durationMinutes: Math.round(Number(e.target.value) * (workout.activity === 'running' ? 6 : 2.5)) })} className="w-8 bg-transparent text-center text-sm font-bold text-slate-900 disabled:text-slate-500" /> km</label>}<button type="button" onClick={() => setCompletion(day.day, workout.id, !workout.completed)} className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition ${workout.completed ? 'border-emerald-200 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'}`}><span className={`grid h-4 w-4 place-items-center rounded-full border ${workout.completed ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>{workout.completed && <Check size={10} />}</span>{workout.completed ? 'Done' : 'Mark done'}</button></div>
                {workout.completed && workout.distanceKm != null && <label className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 px-2.5 py-2 text-xs font-medium text-emerald-800">Actual distance <span><input aria-label="Actual distance" type="number" min="0" value={workout.actualDistanceKm ?? workout.distanceKm} onChange={(e) => setCompletion(day.day, workout.id, true, e.target.value)} className="w-12 rounded-md border border-emerald-200 bg-white px-1.5 py-1 text-right font-bold" /> km</span></label>}
                <div className="mt-2 flex flex-wrap gap-1"><span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${workout.intensity === 'hard' ? 'bg-rose-100 text-rose-700' : workout.intensity === 'easy' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>{workout.intensity}</span>{workout.tags?.map((tag) => <span key={tag} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">{tag}</span>)}</div>
              </div>)}
            </div>
            {day.workouts.length < day.capacity && <div className="mt-3 flex flex-wrap items-center gap-1.5"><span className="mr-0.5 flex items-center text-[10px] font-bold uppercase text-slate-400"><Plus size={12} /></span><button type="button" onClick={() => addWorkout(day.day, 'running')} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:border-violet-300 hover:text-violet-700">Run</button><button type="button" onClick={() => addWorkout(day.day, 'cycling')} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:border-sky-300 hover:text-sky-700">Ride</button><button type="button" onClick={() => setStrengthPickerDay(day.day)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:border-amber-300 hover:text-amber-700">Strength</button></div>}
          </article>)}
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <button type="button" onClick={() => setChecksOpen((open) => !open)} className="flex w-full items-center justify-between text-left"><div><h2 className="font-bold">Constraint check</h2><p className="text-sm text-slate-500">{validCount} of {Object.keys(plan.validation).length} checks passed</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${validCount === Object.keys(plan.validation).length ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{validCount === Object.keys(plan.validation).length ? 'Valid plan' : 'Needs review'}</span>{checksOpen ? <ChevronUp className="text-slate-400" size={18} /> : <ChevronDown className="text-slate-400" size={18} />}</div></button>
          <div className={`${checksOpen ? 'grid' : 'hidden'} mt-4 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3`}>{Object.entries(plan.validation).map(([key, passed]) => <div key={key} className="flex items-center gap-2 text-sm"><span className={`grid h-5 w-5 place-items-center rounded-full ${passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{passed ? <Check size={12} /> : <X size={12} />}</span><span className="capitalize text-slate-600">{key.replace(/([A-Z])/g, ' $1')}</span></div>)}</div>
        </div>
        </>}
      </section>
    </main>
    {strengthPickerDay && <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/45 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setStrengthPickerDay(null) }}><div role="dialog" aria-modal="true" aria-label="Choose strength session" className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6"><div className="mb-5 flex items-start justify-between"><div className="flex items-center gap-3"><ActivityIcon activity="strength" size={17} /><div><p className="text-xs font-bold uppercase tracking-wide text-amber-700">Add to {strengthPickerDay}</p><h2 className="text-xl font-bold tracking-tight">Choose strength session</h2></div></div><button type="button" onClick={() => setStrengthPickerDay(null)} aria-label="Close strength picker" className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"><X size={17} /></button></div><div className="grid grid-cols-2 gap-2">{strengthOptions.map((option) => <button key={option.name} type="button" onClick={() => { addWorkout(strengthPickerDay, 'strength', option.name); setStrengthPickerDay(null) }} className="flex min-h-16 flex-col items-start justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-amber-300 hover:bg-amber-50"><span className="text-sm font-bold text-slate-800">{option.name}</span><span className="mt-0.5 text-xs text-slate-400">{option.durationMinutes} min</span></button>)}</div></div></div>}
    {editor && <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null) }}><div role="dialog" aria-modal="true" aria-label="Edit workout" className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6"><div className="mb-5 flex items-start justify-between"><div className="flex items-center gap-3"><ActivityIcon activity={editor.workout.activity} size={17} /><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Edit workout</p><h2 className="text-xl font-bold tracking-tight">{editor.workout.name}</h2></div></div><button type="button" onClick={() => setEditor(null)} aria-label="Close editor" className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"><X size={17} /></button></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-slate-600">Workout name</span><input value={editor.workout.name} onChange={(event) => setEditor({ ...editor, workout: { ...editor.workout, name: event.target.value } })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></label><label><span className="mb-1.5 block text-xs font-bold text-slate-600">Day</span><select value={editor.day} onChange={(event) => setEditor({ ...editor, day: event.target.value as DayName })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold">{DAYS.map((day) => <option key={day}>{day}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-bold text-slate-600">Time</span><input value={editor.workout.startPeriod ?? ''} onChange={(event) => setEditor({ ...editor, workout: { ...editor.workout, startPeriod: event.target.value } })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></label>{editor.workout.distanceKm != null && <label><span className="mb-1.5 block text-xs font-bold text-slate-600">Distance (km)</span><input type="number" min="0" value={editor.workout.distanceKm} onChange={(event) => setEditor({ ...editor, workout: { ...editor.workout, distanceKm: Number(event.target.value) } })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></label>}<label><span className="mb-1.5 block text-xs font-bold text-slate-600">Duration (minutes)</span><input type="number" min="1" value={editor.workout.durationMinutes} onChange={(event) => setEditor({ ...editor, workout: { ...editor.workout, durationMinutes: Number(event.target.value) } })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></label><label><span className="mb-1.5 block text-xs font-bold text-slate-600">Intensity</span><select value={editor.workout.intensity} onChange={(event) => setEditor({ ...editor, workout: { ...editor.workout, intensity: event.target.value as Workout['intensity'] } })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold"><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Hard</option></select></label><label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-slate-600">Notes</span><textarea rows={3} value={editor.workout.notes ?? ''} onChange={(event) => setEditor({ ...editor, workout: { ...editor.workout, notes: event.target.value } })} placeholder="Add cues, route details, or reminders…" className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label></div>
      <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-between"><button type="button" onClick={duplicateEditor} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"><Copy size={15} /> Duplicate</button><div className="flex gap-2"><button type="button" onClick={() => setEditor(null)} className="h-11 flex-1 rounded-xl px-4 text-sm font-bold text-slate-500 hover:bg-slate-50 sm:flex-none">Cancel</button><button type="button" onClick={saveEditor} className="h-11 flex-1 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white hover:bg-slate-800 sm:flex-none">Save changes</button></div></div></div></div>}
    {undoPlan && <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl"><span>Workout updated</span><button type="button" onClick={() => { commitPlan(undoPlan); setUndoPlan(null) }} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold hover:bg-white/20"><Undo2 size={14} /> Undo</button><button type="button" onClick={() => setUndoPlan(null)} aria-label="Dismiss" className="text-slate-400 hover:text-white"><X size={15} /></button></div>}
  </div>
}

function Metric({ icon, label, value, progress }: { icon: ReactNode, label: string, value: string, progress: number }) {
  const percentage = Math.max(0, Math.min(100, progress * 100))
  return <div className="w-[235px] shrink-0 snap-start rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:w-auto sm:shrink"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-slate-500">{icon}<span className="text-xs font-bold uppercase tracking-wide">{label}</span></div><span className="text-xs font-bold text-emerald-700">{Math.round(percentage)}%</span></div><p className="mb-3 truncate text-base font-bold tracking-tight text-slate-900 lg:text-lg">{value}</p><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all" style={{ width: `${percentage}%` }} /></div></div>
}

export default App
