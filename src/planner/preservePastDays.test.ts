import { describe, expect, it } from 'vitest'
import { generateWeeklyPlan, getCompletedPastWorkouts, getPastDayNames, preservePastDays } from './generatePlan.js'
import { getTotals } from './validator.js'
import type { Preferences } from './types.js'

const preferences: Preferences = {
  workFromHomeDays: ['Tuesday', 'Thursday'], busyDays: ['Wednesday'], unavailableDays: [],
  runningMinKm: 58, runningPreferredKm: 60, runningMaxKm: 62,
  cyclingMinKm: 70, cyclingPreferredKm: 80, cyclingMaxKm: 90, strengthSessions: 4,
  previousRunningKm: 60, previousCyclingKm: 80, previousLongRunKm: 24,
  includeSpeedSession: false, includeLegSession: false, includeCoreSession: true,
  allowWeekdayDoubles: true, preferredLongRunDay: 'Saturday', preferredLongRideDay: 'Tuesday',
  previousWeekFatigue: 'normal', restDay: null,
}

describe('preservePastDays', () => {
  it('keeps every past day exactly as it was while allowing today and later days to regenerate', () => {
    const existing = generateWeeklyPlan(preferences, '2026-10-05')
    const generated = generateWeeklyPlan({ ...preferences, strengthSessions: 2 }, '2026-10-05')

    existing.days[0].type = 'Custom Monday'
    existing.days[0].capacity = 7
    existing.days[0].workouts = []
    existing.days[1].workouts[0].name = 'Completed custom workout'
    existing.days[1].workouts[0].completed = true

    const result = preservePastDays(existing, generated, '2026-10-07')

    expect(result.days[0]).toEqual(existing.days[0])
    expect(result.days[1]).toEqual(existing.days[1])
    expect(result.days[2]).toEqual(generated.days[2])
    expect(result.days.slice(3)).toEqual(generated.days.slice(3))
  })

  it('preserves all seven days when regenerating a previous week', () => {
    const existing = generateWeeklyPlan(preferences, '2026-09-28')
    const generated = generateWeeklyPlan({ ...preferences, strengthSessions: 2 }, '2026-09-28')

    const result = preservePastDays(existing, generated, '2026-10-06')

    expect(result.days).toEqual(existing.days)
  })
  it('counts completed past activities and does not repeat their strength session later in the week', () => {
    const existing = generateWeeklyPlan(preferences, '2026-10-05')
    const monday = existing.days[0]
    monday.workouts = [
      {
        id: 'completed-chest', activity: 'strength', name: 'Chest & tris', durationMinutes: 55,
        intensity: 'moderate', tags: [], completed: true, locked: false,
      },
      {
        id: 'completed-run', activity: 'running', name: 'Easy run', distanceKm: 10,
        actualDistanceKm: 10, durationMinutes: 60, intensity: 'easy', tags: [], completed: true, locked: false,
      },
    ]

    const todayIso = '2026-10-06'
    const completed = getCompletedPastWorkouts(existing, todayIso)
    const generated = generateWeeklyPlan(preferences, existing.weekStart, { completedWorkouts: completed, pastDays: getPastDayNames(existing, todayIso) })
    const result = preservePastDays(existing, generated, todayIso)
    const futureStrengthNames = result.days.slice(1)
      .flatMap((day) => day.workouts)
      .filter((workout) => workout.activity === 'strength')
      .map((workout) => workout.name.toLowerCase())

    expect(futureStrengthNames).not.toContain('chest & triceps')
    expect(getTotals(result.days).strengthSessions).toBe(preferences.strengthSessions)
    expect(getTotals(result.days).runningKm).toBe(preferences.runningPreferredKm)
  })
})