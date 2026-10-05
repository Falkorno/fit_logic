import { DAYS } from './generatePlan.js'

function distanceCaps(day, workout, preferences) {
  if (workout.activity === 'running') {
    if (workout.tags?.includes('Lunch') || workout.tags?.includes('Speed') || workout.tags?.includes('Long')) return null
    if (workout.tags?.includes('Recovery')) return { min: 5, max: 8 }
    return ['Saturday', 'Sunday'].includes(day.day) ? { min: 5, max: 12 } : { min: 5, max: 10 }
  }
  if (workout.activity === 'cycling') {
    if (workout.tags?.includes('Long')) return null
    if (preferences.workFromHomeDays.includes(day.day)) return { min: 10, max: 30 }
    if (['Saturday', 'Sunday'].includes(day.day)) return { min: 10, max: 20 }
    return { min: 5, max: 10 }
  }
  return null
}

function projectedDistance(days, activity) {
  return days.reduce((total, day) => total + day.workouts
    .filter((workout) => workout.activity === activity)
    .reduce((sum, workout) => sum + (workout.completed && workout.actualDistanceKm != null ? workout.actualDistanceKm : workout.distanceKm || 0), 0), 0)
}

function adjustDistance(days, activity, target, preferences, latestCompletedIndex, adjustments) {
  let delta = Math.round(target - projectedDistance(days, activity))
  const candidates = days.flatMap((day) => day.workouts.map((workout) => ({ day, workout })))
    .filter(({ day, workout }) => workout.activity === activity && !workout.completed && !workout.locked)
    .filter(({ day }) => DAYS.indexOf(day.day) > latestCompletedIndex)
    .map((entry) => ({ ...entry, caps: distanceCaps(entry.day, entry.workout, preferences) }))
    .filter((entry) => entry.caps)
  const originalDistances = new Map(candidates.map(({ workout }) => [workout.id, workout.distanceKm]))

  while (delta !== 0 && candidates.length) {
    let changed = false
    for (const entry of candidates) {
      if (delta > 0 && entry.workout.distanceKm < entry.caps.max) {
        entry.workout.distanceKm += 1
        delta -= 1
        changed = true
      } else if (delta < 0 && entry.workout.distanceKm > entry.caps.min) {
        entry.workout.distanceKm -= 1
        delta += 1
        changed = true
      }
      if (delta === 0) break
    }
    if (!changed) break
  }

  for (const { workout } of candidates) {
    workout.durationMinutes = Math.round(workout.distanceKm * (activity === 'running' ? 6 : 2.5))
  }
  for (const { day, workout } of candidates) {
    const before = originalDistances.get(workout.id)
    if (before !== workout.distanceKm) adjustments.push({ day: day.day, workoutId: workout.id, name: workout.name, activity, before, after: workout.distanceKm })
  }
  return delta
}

export function reviewRemainingWeek(days, preferences, targets) {
  const nextDays = structuredClone(days)
  const completedDayIndexes = nextDays.flatMap((day) => day.workouts.some((workout) => workout.completed) ? [DAYS.indexOf(day.day)] : [])
  const latestCompletedIndex = completedDayIndexes.length ? Math.max(...completedDayIndexes) : -1
  const adjustments = []
  let runningUnallocatedKm = adjustDistance(nextDays, 'running', targets.running, preferences, latestCompletedIndex, adjustments)
  let cyclingUnallocatedKm = adjustDistance(nextDays, 'cycling', targets.cycling, preferences, latestCompletedIndex, adjustments)
  const projectedRunning = projectedDistance(nextDays, 'running')
  const projectedCycling = projectedDistance(nextDays, 'cycling')
  const runningMin = Math.min(preferences.runningMinKm, preferences.runningMaxKm)
  const runningMax = Math.max(preferences.runningMinKm, preferences.runningMaxKm)
  if (projectedRunning >= runningMin && projectedRunning <= runningMax) runningUnallocatedKm = 0
  if (projectedCycling >= preferences.cyclingMinKm && projectedCycling <= preferences.cyclingMaxKm) cyclingUnallocatedKm = 0
  return { days: nextDays, review: { runningUnallocatedKm, cyclingUnallocatedKm, latestCompletedDay: latestCompletedIndex >= 0 ? DAYS[latestCompletedIndex] : null, adjustments } }
}

export function getCompletedTotals(days) {
  return days.reduce((totals, day) => {
    for (const workout of day.workouts.filter((item) => item.completed)) {
      if (workout.activity === 'running') totals.runningKm += workout.actualDistanceKm ?? workout.distanceKm ?? 0
      if (workout.activity === 'cycling') totals.cyclingKm += workout.actualDistanceKm ?? workout.distanceKm ?? 0
      if (workout.activity === 'strength') totals.strengthSessions += 1
    }
    return totals
  }, { runningKm: 0, cyclingKm: 0, strengthSessions: 0 })
}
