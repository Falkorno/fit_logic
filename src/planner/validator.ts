export function getTotals(days: PlanDay[]): Totals {
  return days.reduce((totals, day) => {
    for (const workout of day.workouts) {
      const distance = workout.completed && workout.actualDistanceKm != null ? workout.actualDistanceKm : workout.distanceKm
      if (workout.activity === 'running') totals.runningKm += distance || 0
      if (workout.activity === 'cycling') totals.cyclingKm += distance || 0
      if (workout.activity === 'strength') totals.strengthSessions += 1
    }
    return totals
  }, { runningKm: 0, cyclingKm: 0, strengthSessions: 0 })
}

export function validatePlan(days: PlanDay[], preferences: Preferences): Validation {
  const totals = getTotals(days)
  const runningMin = Math.min(preferences.runningMinKm, preferences.runningMaxKm)
  const runningMax = Math.max(preferences.runningMinKm, preferences.runningMaxKm)
  const speedDays = days.filter((day) => day.workouts.some((workout) => workout.tags?.includes('Speed')))
  const speedSessionMidweek = speedDays.every((day) => ['Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(day.day))
  const unavailableClear = days
    .filter((day) => preferences.unavailableDays.includes(day.day))
    .every((day) => day.workouts.length === 0)
  const dedicatedRestClear = !preferences.restDay ||
    days.find((day) => day.day === preferences.restDay)?.workouts.length === 0
  const capacitiesMet = days.every((day) => day.workouts.length <= day.capacity)
  const allAvailableDaysPlanned = days
    .filter((day) => !preferences.unavailableDays.includes(day.day) && day.day !== preferences.restDay)
    .every((day) => day.workouts.length > 0)
  const weekendMinimum = preferences.previousWeekFatigue === 'high' ? 2 : 3
  const weekendSessionsMet = days
    .filter((day) => ['Saturday', 'Sunday'].includes(day.day) && !preferences.unavailableDays.includes(day.day) && day.day !== preferences.restDay)
    .every((day) => day.workouts.length >= weekendMinimum)
  const wfhTemplateMet = days
    .filter((day) => preferences.workFromHomeDays.includes(day.day) && !preferences.unavailableDays.includes(day.day) && day.day !== preferences.restDay)
    .every((day) => {
      const lunchRun = day.workouts.find((workout) => workout.tags?.includes('Lunch'))
      const hasStrength = day.workouts.some((workout) => workout.activity === 'strength')
      const hasCycle = day.workouts.some((workout) => workout.activity === 'cycling')
      return day.workouts.length === 3 && lunchRun?.distanceKm === 5 && hasStrength && hasCycle
    })
  const weekdayRunBoundsMet = days
    .filter((day) => !['Saturday', 'Sunday'].includes(day.day))
    .flatMap((day) => day.workouts.filter((workout) => workout.activity === 'running'))
    .every((workout) => (workout.distanceKm ?? 0) >= 5 && (workout.distanceKm ?? 0) <= 10)
  const weekdayRunTimingMet = days
    .filter((day) => !['Saturday', 'Sunday'].includes(day.day))
    .every((day) => day.workouts
      .filter((workout) => workout.activity === 'running')
      .every((workout) => workout.startPeriod !== 'Morning'))
  const longRideCapMet = days
    .flatMap((day) => day.workouts.filter((workout) => workout.activity === 'cycling' && workout.tags?.includes('Long')))
    .every((workout) => (workout.distanceKm ?? 0) <= 30)
  const supplementaryRideCapsMet = days.every((day) => day.workouts
    .filter((workout) => workout.activity === 'cycling' && !workout.tags?.includes('Long'))
    .every((workout) => {
      if (preferences.workFromHomeDays.includes(day.day)) return (workout.distanceKm ?? 0) <= 30
      if (['Saturday', 'Sunday'].includes(day.day)) return (workout.distanceKm ?? 0) <= 20
      return (workout.distanceKm ?? 0) <= 10
    }))
  const sundayRideEasyMet = days.find((day) => day.day === 'Sunday')?.workouts
    .filter((workout) => workout.activity === 'cycling')
    .every((workout) => workout.intensity === 'easy' && !workout.tags?.includes('Long') && (workout.distanceKm ?? 0) <= 20) ?? true
  const saturdayLongRunMet = preferences.unavailableDays.includes('Saturday') || preferences.restDay === 'Saturday' ||
    days.find((day) => day.day === 'Saturday')?.workouts.some((workout) => workout.activity === 'running' && workout.tags?.includes('Long'))
  const sundayRecoveryRunMet = preferences.unavailableDays.includes('Saturday') || preferences.restDay === 'Saturday' ||
    preferences.unavailableDays.includes('Sunday') || preferences.restDay === 'Sunday' ||
    days.find((day) => day.day === 'Sunday')?.workouts.some((workout) => workout.activity === 'running' && workout.tags?.includes('Recovery') && (workout.distanceKm ?? 0) <= 8)
  const incompatiblePairingsClear = days.every((day) => {
    const runs = day.workouts.filter((workout) => workout.activity === 'running')
    const hasLongRun = runs.some((workout) => workout.tags?.includes('Long'))
    const hasHardCycle = day.workouts.some((workout) => workout.activity === 'cycling' && workout.intensity === 'hard')
    return runs.length <= 1 && !(hasLongRun && hasHardCycle)
  })
  const hardDays = days.map((day) => day.workouts.some((workout) => workout.intensity === 'hard'))
  const hardSessionSpacingMet = !hardDays.some((hard, index) => hard && hardDays[index + 1] && hardDays[index + 2])
  const legRecoveryMet = days.every((day, index) => {
    if (!day.workouts.some((workout) => workout.tags?.includes('Legs'))) return true
    const adjacentHard = [days[index - 1], day, days[index + 1]]
      .filter((candidate): candidate is PlanDay => Boolean(candidate))
      .some((candidate) => candidate.workouts.some((workout) => workout.tags?.includes('Speed') || workout.tags?.includes('Long')))
    return !adjacentHard
  })

  return {
    strengthTargetMet: totals.strengthSessions === preferences.strengthSessions,
    runningTargetMet: totals.runningKm >= runningMin && totals.runningKm <= runningMax,
    cyclingTargetMet: totals.cyclingKm >= preferences.cyclingMinKm && totals.cyclingKm <= preferences.cyclingMaxKm,
    speedSessionStandalone: !preferences.includeSpeedSession ||
      (speedDays.length === 1 && speedDays[0].workouts.length === 1),
    speedSessionMidweek,
    unavailableDaysClear: unavailableClear,
    dedicatedRestClear,
    allAvailableDaysPlanned,
    weekendSessionsMet,
    wfhTemplateMet,
    weekdayRunBoundsMet,
    weekdayRunTimingMet,
    longRideCapMet,
    supplementaryRideCapsMet,
    sundayRideEasyMet,
    saturdayLongRunMet: Boolean(saturdayLongRunMet),
    sundayRecoveryRunMet: Boolean(sundayRecoveryRunMet),
    incompatiblePairingsClear,
    hardSessionSpacingMet,
    legRecoveryMet,
    capacitiesMet,
  }
}

const issueMessages: Record<string, string> = {
  strengthTargetMet: 'Strength session count does not match the selected target.',
  runningTargetMet: 'Running volume is outside the effective weekly range.',
  cyclingTargetMet: 'Cycling volume is outside the effective weekly range.',
  speedSessionStandalone: 'The speed session must be the only workout on its day.',
  speedSessionMidweek: 'Speed work must be scheduled between Tuesday and Friday, never Monday.',
  unavailableDaysClear: 'An unavailable day still contains a workout.',
  dedicatedRestClear: 'The dedicated rest day still contains a workout.',
  allAvailableDaysPlanned: 'At least one available day has no planned exercise.',
  weekendSessionsMet: 'Each available weekend day needs three sessions.',
  wfhTemplateMet: 'Each WFH day needs a 5 km lunch run, strength workout and cycle session.',
  weekdayRunBoundsMet: 'A weekday run is outside the 5–10 km limit.',
  weekdayRunTimingMet: 'A weekday run is scheduled in the morning.',
  longRideCapMet: 'A long ride exceeds the 30 km limit.',
  supplementaryRideCapsMet: 'A supplementary ride exceeds its weekday or flexible-day limit.',
  sundayRideEasyMet: 'Sunday cycling should be an easy ride of 20 km or less.',
  saturdayLongRunMet: 'Saturday is missing the long run.',
  sundayRecoveryRunMet: 'Sunday is missing a recovery run of 8 km or less.',
  incompatiblePairingsClear: 'A day contains incompatible endurance sessions.',
  hardSessionSpacingMet: 'The plan contains three consecutive hard training days.',
  legRecoveryMet: 'Legs are too close to a speed or long session.',
  capacitiesMet: 'A day contains more sessions than its capacity allows.',
}

export function getValidationIssues(validation: Validation): string[] {
  return Object.entries(validation)
    .filter(([, passed]) => !passed)
    .map(([key]) => issueMessages[key] || `${key} failed.`)
}
import type { PlanDay, Preferences, Totals, Validation } from './types.js'
