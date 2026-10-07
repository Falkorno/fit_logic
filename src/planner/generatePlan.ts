import { getTotals, validatePlan } from './validator.js'
import { DAY_NAMES } from './types.js'
import type { DayName, Intensity, PlanDay, Preferences, Workout, WeeklyPlan } from './types.js'

export const DAYS = [...DAY_NAMES]

export interface GenerationProgress {
  completedWorkouts: Workout[]
  pastDays?: DayName[]
}

export function getPastDayNames(plan: WeeklyPlan, todayIso: string): DayName[] {
  const weekStart = new Date(`${plan.weekStart}T00:00:00Z`)
  return plan.days.filter((_, index) => {
    const date = new Date(weekStart)
    date.setUTCDate(weekStart.getUTCDate() + index)
    return date.toISOString().slice(0, 10) < todayIso
  }).map((day) => day.day)
}
export function getCompletedPastWorkouts(plan: WeeklyPlan, todayIso: string): Workout[] {
  const weekStart = new Date(`${plan.weekStart}T00:00:00Z`)
  return plan.days.flatMap((day, index) => {
    const date = new Date(weekStart)
    date.setUTCDate(weekStart.getUTCDate() + index)
    return date.toISOString().slice(0, 10) < todayIso
      ? day.workouts.filter((workout) => workout.completed)
      : []
  })
}

export function preservePastDays(existing: WeeklyPlan, generated: WeeklyPlan, todayIso: string): WeeklyPlan {
  const weekStart = new Date(`${generated.weekStart}T00:00:00Z`)
  const days = generated.days.map((generatedDay, index) => {
    const date = new Date(weekStart)
    date.setUTCDate(weekStart.getUTCDate() + index)
    if (date.toISOString().slice(0, 10) >= todayIso) return generatedDay

    const existingDay = existing.days.find((day) => day.day === generatedDay.day)
    return existingDay ? structuredClone(existingDay) : generatedDay
  })

  return { ...generated, days }
}
const strengthNames = [
  'Back & biceps',
  'Chest & triceps',
  'Arms',
  'Core',
  'Back & chest',
  'Shoulders',
]

const strengthDurations: Record<string, number> = {
  'Back & biceps': 55,
  'Chest & triceps': 55,
  Arms: 40,
  Core: 25,
  'Back & chest': 60,
  Shoulders: 35,
  Legs: 55,
}

function capacityFor(day: DayName, preferences: Preferences): number {
  if (preferences.restDay === day) return 0
  if (preferences.unavailableDays.includes(day)) return 0
  if (preferences.workFromHomeDays.includes(day) || ['Saturday', 'Sunday'].includes(day)) return 3
  if (preferences.busyDays.includes(day)) return 1
  return preferences.allowWeekdayDoubles ? 2 : 1
}

function typeFor(day: DayName, preferences: Preferences): string {
  if (preferences.restDay === day) return 'Rest'
  if (preferences.unavailableDays.includes(day)) return 'Unavailable'
  if (preferences.busyDays.includes(day)) return 'Busy'
  if (preferences.workFromHomeDays.includes(day)) return 'WFH'
  if (['Saturday', 'Sunday'].includes(day)) return 'Weekend'
  return 'Office'
}

const run = (name: string, km: number, intensity: Intensity, tags: string[] = []): Workout => ({ id: crypto.randomUUID(), activity: 'running', name, distanceKm: km, actualDistanceKm: null, completed: false, durationMinutes: name === 'Lunch run' ? 30 : Math.round(km * 6), startPeriod: name === 'Lunch run' ? 'Lunch' : 'Morning', intensity, tags, locked: false })
const ride = (name: string, km: number, intensity: Intensity, tags: string[] = []): Workout => ({ id: crypto.randomUUID(), activity: 'cycling', name, distanceKm: km, actualDistanceKm: null, completed: false, durationMinutes: Math.round(km * 2.5), startPeriod: name === 'Easy spin' ? 'After strength' : 'Evening', intensity, tags, locked: false })
const strength = (name: string, intensity: Intensity = 'moderate', tags: string[] = []): Workout => ({
  id: crypto.randomUUID(),
  activity: 'strength',
  name,
  durationMinutes: strengthDurations[name] || 50,
  startPeriod: 'Evening',
  intensity,
  tags,
  locked: false,
  completed: false,
})

function optimizeStrengthPairings(days: PlanDay[]): void {
  const strengthSlots = days
    .flatMap((day) => day.workouts
      .map((workout, index) => ({ day, workout, index }))
      .filter(({ workout }) => workout.activity === 'strength' && !workout.tags?.includes('Legs')))
    .sort((a, b) => {
      const aOtherSessions = a.day.workouts.filter((workout) => workout.activity !== 'strength').length
      const bOtherSessions = b.day.workouts.filter((workout) => workout.activity !== 'strength').length
      const loadDifference = bOtherSessions - aOtherSessions
      if (loadDifference !== 0) return loadDifference
      const aWeekend = ['Saturday', 'Sunday'].includes(a.day.day) ? 0 : 1
      const bWeekend = ['Saturday', 'Sunday'].includes(b.day.day) ? 0 : 1
      return aWeekend - bWeekend
    })
  const strengthWorkouts = days
    .flatMap((day) => day.workouts.filter((workout) => workout.activity === 'strength' && !workout.tags?.includes('Legs')))
    .sort((a, b) => a.durationMinutes - b.durationMinutes)

  strengthSlots.forEach((slot, index) => {
    slot.day.workouts[slot.index] = strengthWorkouts[index]
  })
}

function balanceWeekends(days: PlanDay[], preferences: Preferences, blocked: Set<DayName>): void {
  const weekends = days.filter((day) => ['Saturday', 'Sunday'].includes(day.day) && day.capacity > 0)

  for (const weekend of weekends) {
    while (weekend.workouts.length < 3) {
      const donors = days
        .filter((day) => day.day !== weekend.day && !blocked.has(day.day) && day.workouts.length > 1)
        .filter((day) => {
          const minimumToKeep = preferences.workFromHomeDays.includes(day.day) ? 3 : 1
          return day.workouts.length > minimumToKeep
        })
        .sort((a, b) => b.workouts.length - a.workouts.length)
      const donor = donors[0]
      if (!donor) break

      const movableIndex = donor.workouts.findIndex((workout) =>
        workout.activity === 'strength' && !workout.tags?.includes('Legs'))
      const workoutIndex = movableIndex
      if (workoutIndex < 0) break
      weekend.workouts.push(donor.workouts.splice(workoutIndex, 1)[0])
    }
  }
}

function available(day: DayName, blocked: Set<DayName>, preferences: Preferences): boolean {
  return !blocked.has(day) && !preferences.unavailableDays.includes(day) && preferences.restDay !== day
}

function allocateBoundedDistance(total: number, slotCount: number, minimum: number, maximum: number): number[] {
  if (total <= 0) return []
  for (let count = Math.ceil(total / maximum); count <= slotCount; count += 1) {
    if (total < count * minimum || total > count * maximum) continue
    const distances = []
    let remaining = total
    for (let index = 0; index < count; index += 1) {
      const slotsLeft = count - index
      const distance = Math.min(maximum, Math.max(minimum, Math.round(remaining / slotsLeft)))
      distances.push(distance)
      remaining -= distance
    }
    if (remaining === 0) return distances
  }
  return []
}

function allocateWithCaps(total: number, caps: number[], minimum = 5): number[] {
  if (!caps.length || total < minimum) return []
  const activeCaps = caps.slice(0, Math.min(caps.length, Math.floor(total / minimum)))
  const distances = activeCaps.map(() => minimum)
  let remaining = total - distances.reduce((sum, distance) => sum + distance, 0)
  while (remaining > 0) {
    const index = distances.findIndex((distance, position) => distance < activeCaps[position])
    if (index < 0) break
    distances[index] += 1
    remaining -= 1
  }
  return distances
}

function choose(preferred: DayName | null | undefined, candidates: DayName[], blocked: Set<DayName>, preferences: Preferences): DayName | undefined {
  if (preferred && available(preferred, blocked, preferences)) return preferred
  return candidates.find((day) => available(day, blocked, preferences))
}

function addWorkout(days: PlanDay[], dayName: DayName, workout: Workout): boolean {
  const day = days.find((item) => item.day === dayName)
  if (day && day.workouts.length < day.capacity) {
    day.workouts.push(workout)
    return true
  }
  return false
}

export function generateWeeklyPlan(preferences: Preferences, weekStart?: string, progress?: GenerationProgress): WeeklyPlan {
  const completedWorkouts = progress?.completedWorkouts ?? []
  const completedRunningKm = completedWorkouts.filter((workout) => workout.activity === 'running').reduce((sum, workout) => sum + (workout.actualDistanceKm ?? workout.distanceKm ?? 0), 0)
  const completedCyclingKm = completedWorkouts.filter((workout) => workout.activity === 'cycling').reduce((sum, workout) => sum + (workout.actualDistanceKm ?? workout.distanceKm ?? 0), 0)
  const completedStrength = completedWorkouts.filter((workout) => workout.activity === 'strength')
  const normalizeStrengthName = (name: string) => name.toLowerCase().replace(/\btris\b/g, 'triceps').replace(/[^a-z]+/g, ' ').trim()
  const completedStrengthNames = new Set(completedStrength.map((workout) => normalizeStrengthName(workout.name)))
  const completedSpeed = completedWorkouts.some((workout) => workout.activity === 'running' && workout.tags?.includes('Speed'))
  const completedLongRun = completedWorkouts.some((workout) => workout.activity === 'running' && workout.tags?.includes('Long'))
  const completedLongRide = completedWorkouts.some((workout) => workout.activity === 'cycling' && workout.tags?.includes('Long'))
  const fatigueFactor = preferences.previousWeekFatigue === 'high' ? 0.85 : 1
  const runningMin = Math.min(preferences.runningMinKm, preferences.runningMaxKm)
  const runningMax = Math.max(preferences.runningMinKm, preferences.runningMaxKm)
  const requestedRunningTarget = Math.min(runningMax, Math.max(runningMin, preferences.runningPreferredKm ?? Math.round((runningMin + runningMax) / 2)))
  const requestedCyclingTarget = Math.min(preferences.cyclingMaxKm, Math.max(preferences.cyclingMinKm, preferences.cyclingPreferredKm ?? Math.round((preferences.cyclingMinKm + preferences.cyclingMaxKm) / 2)))
  const runningProgressionCap = preferences.previousRunningKm > 0 ? Math.floor(preferences.previousRunningKm * 1.1) : requestedRunningTarget
  const cyclingProgressionCap = preferences.previousCyclingKm > 0 ? Math.floor(preferences.previousCyclingKm * 1.15) : requestedCyclingTarget
  const runningTarget = Math.round(Math.min(requestedRunningTarget, runningProgressionCap) * fatigueFactor)
  const cyclingTarget = Math.round(Math.min(requestedCyclingTarget, cyclingProgressionCap) * fatigueFactor)
  const runningToPlan = Math.max(0, runningTarget - completedRunningKm)
  const cyclingToPlan = Math.max(0, cyclingTarget - completedCyclingKm)
  const strengthToPlan = Math.max(0, preferences.strengthSessions - completedStrength.length)
  const days: PlanDay[] = DAYS.map((day) => ({ day, type: typeFor(day, preferences), capacity: capacityFor(day, preferences), workouts: [] }))
  const blocked = new Set<DayName>(progress?.pastDays ?? [])

  if (preferences.includeSpeedSession && !completedSpeed && runningToPlan > 0) {
    const speedCandidates = (['Wednesday', 'Tuesday', 'Thursday', 'Friday'] as DayName[])
      .filter((day) => !preferences.workFromHomeDays.includes(day))
    const speedDay = choose(null, speedCandidates, blocked, preferences)
    if (speedDay) {
      addWorkout(days, speedDay, run('Speed intervals', Math.min(10, Math.max(6, Math.round(runningTarget * 0.15))), 'hard', ['Speed']))
      blocked.add(speedDay)
    }
  }

  const longRunDay = completedLongRun || runningToPlan <= 0 ? undefined : choose(preferences.preferredLongRunDay, ['Sunday', 'Saturday', 'Thursday', 'Tuesday'], blocked, preferences)
  if (longRunDay) {
    const proposedLongRun = Math.round(runningTarget * 0.4)
    const longRunCap = preferences.previousLongRunKm > 0 ? Math.max(5, Math.floor(preferences.previousLongRunKm * 1.1)) : proposedLongRun
    addWorkout(days, longRunDay, run('Long run', Math.min(proposedLongRun, longRunCap, runningToPlan), 'hard', ['Long']))
  }

  const preferredWfhRideDay = preferences.workFromHomeDays.find((day) => available(day, blocked, preferences))
  const longRideDay = completedLongRide || cyclingToPlan <= 0 ? undefined : choose(preferredWfhRideDay || preferences.preferredLongRideDay, [...preferences.workFromHomeDays, 'Sunday', 'Saturday'], blocked, preferences)
  if (longRideDay) {
    addWorkout(days, longRideDay, ride('Endurance ride', Math.min(25, Math.round(cyclingTarget * 0.3), cyclingToPlan), 'moderate', ['Long']))
  }

  const configuredStrengthNames = preferences.includeCoreSession
    ? strengthNames
    : strengthNames.filter((name) => name !== 'Core')
  const weeklyStrengthNames = configuredStrengthNames.filter((name) => !completedStrengthNames.has(normalizeStrengthName(name)))
  for (let i = 0; i < strengthToPlan; i += 1) {
    const strengthDays = DAYS.filter((dayName) => available(dayName, blocked, preferences))
        .filter((dayName) => {
          const day = days.find((item) => item.day === dayName)
          return day!.workouts.length < day!.capacity
        })
        .filter((dayName) => {
          if ((weeklyStrengthNames[i % weeklyStrengthNames.length] ?? configuredStrengthNames[i % configuredStrengthNames.length]) !== 'Legs' && !(i === 0 && preferences.includeLegSession)) return true
          const index = DAYS.indexOf(dayName)
          return [DAYS[index - 1], dayName, DAYS[index + 1]]
            .filter(Boolean)
            .every((nearbyDay) => !days.find((day) => day.day === nearbyDay)?.workouts
              .some((workout) => workout.tags?.includes('Speed') || workout.tags?.includes('Long')))
        })
        .sort((a, b) => {
          const aDay = days.find((day) => day.day === a)
          const bDay = days.find((day) => day.day === b)
          const aHasStrength = aDay!.workouts.some((workout) => workout.activity === 'strength') ? 1 : 0
          const bHasStrength = bDay!.workouts.some((workout) => workout.activity === 'strength') ? 1 : 0
          if (aHasStrength !== bHasStrength) return aHasStrength - bHasStrength
      const preferredRank = (dayName: DayName) => preferences.workFromHomeDays.includes(dayName)
            ? 0
            : ['Saturday', 'Sunday'].includes(dayName) ? 1 : preferences.busyDays.includes(dayName) ? 3 : 2
          const rankDifference = preferredRank(a) - preferredRank(b)
          if (rankDifference !== 0) return rankDifference
          return aDay!.workouts.length - bDay!.workouts.length
        })
    const dayName = strengthDays[0]
    if (!dayName) break
    let name = weeklyStrengthNames[i % weeklyStrengthNames.length] ?? configuredStrengthNames[i % configuredStrengthNames.length]
    let tags: string[] = []
    if (i === 0 && preferences.includeLegSession) { name = 'Legs'; tags = ['Legs'] }
    if (name === 'Core') tags = ['Core']
    addWorkout(days, dayName, strength(name, name === 'Legs' ? 'hard' : 'moderate', tags))
  }

  const currentRun = getTotals(days).runningKm
  let remainingRun = runningToPlan - currentRun

  // WFH template: a fixed 5 km lunchtime run, strength, then cycling.
  for (const dayName of preferences.workFromHomeDays) {
    if (remainingRun <= 0 || blocked.has(dayName) || preferences.unavailableDays.includes(dayName)) continue
    if (addWorkout(days, dayName, run('Lunch run', Math.min(5, remainingRun), 'easy', ['Lunch']))) remainingRun -= Math.min(5, remainingRun)
  }

  // Sunday is deliberately easy after Saturday's long run.
  if (remainingRun > 0 && longRunDay === 'Saturday' && available('Sunday', blocked, preferences)) {
    const recoveryKm = Math.min(8, Math.max(5, Math.round(runningTarget * 0.1)), remainingRun)
    if (addWorkout(days, 'Sunday', run('Recovery run', recoveryKm, 'easy', ['Recovery']))) remainingRun -= recoveryKm
  }

  const weekdayRunCandidates = DAYS
    .filter((dayName) => !['Saturday', 'Sunday'].includes(dayName))
    .filter((dayName) => !preferences.workFromHomeDays.includes(dayName))
    .filter((dayName) => available(dayName, blocked, preferences))
    .filter((dayName) => {
      const day = days.find((item) => item.day === dayName)
      return day!.workouts.length < day!.capacity
    })
    .sort((a, b) => {
      const aDay = days.find((day) => day.day === a)
      const bDay = days.find((day) => day.day === b)
      return aDay!.workouts.length - bDay!.workouts.length
    })
  const weekdayDistances = allocateBoundedDistance(remainingRun, weekdayRunCandidates.length, 5, 10)
  for (let index = 0; index < weekdayDistances.length; index += 1) {
    if (addWorkout(days, weekdayRunCandidates[index], run('Easy run', weekdayDistances[index], 'easy'))) {
      remainingRun -= weekdayDistances[index]
    }
  }

  let remainingCycle = cyclingToPlan - getTotals(days).cyclingKm
  const cycleCandidates = DAYS.filter((day) => available(day, blocked, preferences))
    .filter((day) => day !== longRideDay)
    .filter((dayName) => {
      const day = days.find((item) => item.day === dayName)
      return day!.workouts.length < day!.capacity
    })
  const cycleSlots = Math.min(4, cycleCandidates.length)
  const cycleDays = [...cycleCandidates]
    .sort((a, b) => {
      const rank = (dayName: DayName) => {
        const day = days.find((item) => item.day === dayName)
        if (preferences.workFromHomeDays.includes(dayName)) return 0
        if (day!.workouts.length === 0) return 1
        if (['Saturday', 'Sunday'].includes(dayName)) return 2
        if (day!.workouts.some((workout) => workout.activity === 'strength')) return 3
        return 4
      }
      return rank(a) - rank(b)
    })
    .slice(0, cycleSlots)
  const flexibleCycleDays = cycleDays.filter((dayName) =>
    preferences.workFromHomeDays.includes(dayName) || ['Saturday', 'Sunday'].includes(dayName))
  const shortCycleDays = cycleDays.filter((dayName) => !flexibleCycleDays.includes(dayName))

  // Normal weekday rides are conservative 10 km supplements. WFH/weekend
  // rides may be longer, with WFH rides capped at 30 km and weekend
  // supplementary rides kept at 20 km or less.
  for (const dayName of shortCycleDays) {
    if (remainingCycle < 10) break
    if (addWorkout(days, dayName, ride('Short indoor ride', 10, 'easy', ['Recovery']))) remainingCycle -= 10
  }
  const flexibleDistances = allocateWithCaps(
    remainingCycle,
    flexibleCycleDays.map((dayName) => preferences.workFromHomeDays.includes(dayName) ? 30 : 20),
    10,
  )
  for (let index = 0; index < flexibleDistances.length; index += 1) {
    if (addWorkout(days, flexibleCycleDays[index], ride('Easy spin', flexibleDistances[index], 'easy', ['Recovery']))) {
      remainingCycle -= flexibleDistances[index]
    }
  }

  balanceWeekends(days, preferences, blocked)
  if (preferences.previousWeekFatigue === 'high') {
    for (const day of days) {
      for (const workout of day.workouts) {
        if (workout.activity === 'strength') {
          workout.intensity = 'easy'
          workout.durationMinutes = Math.max(20, Math.round(workout.durationMinutes * 0.8))
        }
      }
    }
  }
  optimizeStrengthPairings(days)
  for (const day of days) {
    for (const workout of day.workouts) {
      if (workout.activity === 'running') {
        if (preferences.workFromHomeDays.includes(day.day) && workout.tags?.includes('Lunch')) workout.startPeriod = 'Lunch'
        else if (['Saturday', 'Sunday'].includes(day.day)) workout.startPeriod = 'Morning'
        else workout.startPeriod = 'Evening'
      }
      if (workout.activity === 'cycling') {
        if (preferences.workFromHomeDays.includes(day.day)) workout.startPeriod = 'After strength'
        else if (['Saturday', 'Sunday'].includes(day.day)) workout.startPeriod = 'Afternoon'
      }
    }
    if (!preferences.workFromHomeDays.includes(day.day)) continue
    const activityOrder = { running: 0, strength: 1, cycling: 2 }
    day.workouts.sort((a, b) => activityOrder[a.activity] - activityOrder[b.activity])
  }

  const totals = getTotals(days)
  const progressionLimited = runningTarget < runningMin || cyclingTarget < preferences.cyclingMinKm
  const adjustedPreferences = progressionLimited || preferences.previousWeekFatigue === 'high'
    ? { ...preferences, runningMinKm: Math.max(0, runningTarget - 2), runningMaxKm: runningTarget + 2, cyclingMinKm: Math.max(0, cyclingTarget - 5), cyclingMaxKm: cyclingTarget + 5 }
    : preferences
  const validation = validatePlan(days, adjustedPreferences)
  const notes: string[] = []
  if (preferences.previousWeekFatigue === 'high') notes.push('Weekly volume and strength duration reduced because you reported high fatigue.')
  if (runningTarget < requestedRunningTarget) notes.push(`Running reduced to ${runningTarget} km to limit the increase from last week's ${preferences.previousRunningKm} km.`)
  if (cyclingTarget < requestedCyclingTarget) notes.push(`Cycling reduced to ${cyclingTarget} km to limit the increase from last week's ${preferences.previousCyclingKm} km.`)
  return {
    weekStart: weekStart ?? new Date().toISOString().slice(0, 10),
    days,
    totals,
    validation,
    effectivePreferences: adjustedPreferences,
    targets: { running: runningTarget, cycling: cyclingTarget },
    note: notes.join(' '),
  }
}
