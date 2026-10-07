import { describe, expect, it } from 'vitest'
import { generateWeeklyPlan } from './generatePlan.js'
import { getTotals } from './validator.js'
import { reviewRemainingWeek } from './reviewPlan.js'

const defaults = {
  workFromHomeDays: ['Tuesday', 'Thursday'],
  busyDays: ['Wednesday'],
  unavailableDays: [],
  runningMinKm: 58,
  runningPreferredKm: 60,
  runningMaxKm: 62,
  cyclingMinKm: 70,
  cyclingPreferredKm: 80,
  cyclingMaxKm: 90,
  previousRunningKm: 60,
  previousCyclingKm: 80,
  previousLongRunKm: 24,
  strengthSessions: 4,
  includeSpeedSession: false,
  includeLegSession: false,
  includeCoreSession: true,
  allowWeekdayDoubles: true,
  preferredLongRunDay: 'Saturday',
  preferredLongRideDay: 'Tuesday',
  previousWeekFatigue: 'normal',
  restDay: null,
}

describe('generateWeeklyPlan', () => {
  it('builds a fully valid default week', () => {
    const plan = generateWeeklyPlan(defaults)
    expect(Object.values(plan.validation).every(Boolean)).toBe(true)
    expect(plan.totals).toEqual({ runningKm: 60, cyclingKm: 80, strengthSessions: 4 })
  })

  it('uses the exact WFH template', () => {
    const plan = generateWeeklyPlan(defaults)
    for (const day of plan.days.filter((item) => defaults.workFromHomeDays.includes(item.day))) {
      expect(day.workouts).toHaveLength(3)
      expect(day.workouts.map((workout) => workout.activity)).toEqual(['running', 'strength', 'cycling'])
      expect(day.workouts[0].distanceKm).toBe(5)
    }
  })

  it('never uses a WFH day for a standalone speed session', () => {
    const plan = generateWeeklyPlan({ ...defaults, includeSpeedSession: true })
    for (const day of plan.days.filter((item) => defaults.workFromHomeDays.includes(item.day))) {
      expect(day.workouts).toHaveLength(3)
      expect(day.workouts.some((workout) => workout.tags.includes('Speed'))).toBe(false)
    }
  })

  it('places speed work midweek and never on Monday', () => {
    const plan = generateWeeklyPlan({ ...defaults, includeSpeedSession: true })
    const speedDay = plan.days.find((day) => day.workouts.some((workout) => workout.tags.includes('Speed')))
    expect(['Tuesday', 'Wednesday', 'Thursday', 'Friday']).toContain(speedDay.day)
    expect(speedDay.day).not.toBe('Monday')
    expect(plan.validation.speedSessionMidweek).toBe(true)
  })

  it('keeps a constrained WFH day tripled even when the cycling midpoint is not exactly divisible', () => {
    const plan = generateWeeklyPlan({
      ...defaults,
      workFromHomeDays: ['Wednesday'],
      busyDays: ['Thursday'],
      unavailableDays: ['Friday'],
    })
    const wednesday = plan.days.find((day) => day.day === 'Wednesday')
    expect(wednesday.workouts.map((workout) => workout.activity)).toEqual(['running', 'strength', 'cycling'])
    expect(plan.validation.wfhTemplateMet).toBe(true)
    expect(plan.totals.cyclingKm).toBeGreaterThanOrEqual(70)
  })

  it('keeps weekday runs and cycling sessions within their caps', () => {
    const plan = generateWeeklyPlan(defaults)
    for (const day of plan.days) {
      if (!['Saturday', 'Sunday'].includes(day.day)) {
        for (const workout of day.workouts.filter((item) => item.activity === 'running')) {
          expect(workout.distanceKm).toBeGreaterThanOrEqual(5)
          expect(workout.distanceKm).toBeLessThanOrEqual(10)
        }
      }
      for (const workout of day.workouts.filter((item) => item.activity === 'cycling' && item.tags.includes('Long'))) {
        expect(workout.distanceKm).toBeLessThanOrEqual(30)
      }
    }
  })

  it('places legs away from speed and long sessions', () => {
    const plan = generateWeeklyPlan({ ...defaults, includeSpeedSession: true, includeLegSession: true })
    expect(plan.validation.legRecoveryMet).toBe(true)
    expect(plan.validation.speedSessionStandalone).toBe(true)
  })

  it('preserves a dedicated rest day', () => {
    const plan = generateWeeklyPlan({ ...defaults, restDay: 'Wednesday' })
    expect(plan.days.find((day) => day.day === 'Wednesday').workouts).toHaveLength(0)
    expect(plan.validation.dedicatedRestClear).toBe(true)
  })

  it('reports an infeasible target instead of inflating rides', () => {
    const plan = generateWeeklyPlan({ ...defaults, cyclingMinKm: 140, cyclingPreferredKm: 150, cyclingMaxKm: 160, previousCyclingKm: 150 })
    const rides = plan.days.flatMap((day) => day.workouts.filter((workout) => workout.activity === 'cycling'))
    expect(plan.validation.cyclingTargetMet).toBe(false)
    expect(Math.max(...rides.map((workout) => workout.distanceKm))).toBeLessThanOrEqual(30)
  })

  it('limits progression from a lower-volume previous week', () => {
    const plan = generateWeeklyPlan({ ...defaults, previousRunningKm: 40, previousCyclingKm: 50 })
    expect(plan.targets.running).toBeLessThanOrEqual(44)
    expect(plan.targets.cycling).toBeLessThanOrEqual(57)
    expect(plan.note).toContain('limit the increase')
  })

  it('assigns timing metadata to every generated workout', () => {
    const plan = generateWeeklyPlan(defaults)
    for (const workout of plan.days.flatMap((day) => day.workouts)) {
      expect(workout.durationMinutes).toBeGreaterThan(0)
      expect(workout.startPeriod).toBeTruthy()
    }
  })

  it('never schedules a weekday run in the morning', () => {
    const plan = generateWeeklyPlan(defaults)
    const weekdayRuns = plan.days
      .filter((day) => !['Saturday', 'Sunday'].includes(day.day))
      .flatMap((day) => day.workouts.filter((workout) => workout.activity === 'running'))
    expect(weekdayRuns.every((workout) => workout.startPeriod !== 'Morning')).toBe(true)
    expect(plan.validation.weekdayRunTimingMet).toBe(true)
  })

  it('keeps Sunday cycling easy and places the longer ride on a WFH day', () => {
    const plan = generateWeeklyPlan(defaults)
    const sundayRides = plan.days.find((day) => day.day === 'Sunday').workouts.filter((workout) => workout.activity === 'cycling')
    expect(sundayRides.every((workout) => workout.intensity === 'easy' && workout.distanceKm <= 20 && !workout.tags.includes('Long'))).toBe(true)
    const longRideDay = plan.days.find((day) => day.workouts.some((workout) => workout.activity === 'cycling' && workout.tags.includes('Long')))
    expect(defaults.workFromHomeDays).toContain(longRideDay.day)
    expect(plan.validation.sundayRideEasyMet).toBe(true)
  })

  it.each([
    { name: 'Monday WFH', changes: { workFromHomeDays: ['Monday'] } },
    { name: 'Friday unavailable', changes: { unavailableDays: ['Friday'] } },
    { name: 'high fatigue', changes: { previousWeekFatigue: 'high' } },
    { name: 'Wednesday rest', changes: { restDay: 'Wednesday' } },
  ])('keeps hard safety caps in the $name scenario', ({ changes }) => {
    const plan = generateWeeklyPlan({ ...defaults, ...changes })
    const workouts = plan.days.flatMap((day) => day.workouts)
    expect(workouts.filter((workout) => workout.activity === 'cycling' && workout.tags.includes('Long')).every((workout) => workout.distanceKm <= 30)).toBe(true)
    expect(plan.validation.capacitiesMet).toBe(true)
    expect(plan.validation.weekdayRunBoundsMet).toBe(true)
  })

  it('normalizes inverted running ranges', () => {
    const plan = generateWeeklyPlan({ ...defaults, runningMinKm: 62, runningMaxKm: 58 })
    expect(plan.totals.runningKm).toBeGreaterThanOrEqual(58)
    expect(plan.totals.runningKm).toBeLessThanOrEqual(62)
  })

  it('reduces later easy running after extra completed distance', () => {
    const plan = generateWeeklyPlan(defaults)
    const mondayRun = plan.days.find((day) => day.day === 'Monday').workouts.find((workout) => workout.activity === 'running')
    mondayRun.completed = true
    mondayRun.actualDistanceKm = mondayRun.distanceKm + 3
    const beforeWednesday = plan.days.find((day) => day.day === 'Wednesday').workouts.find((workout) => workout.activity === 'running').distanceKm
    const reviewed = reviewRemainingWeek(plan.days, plan.effectivePreferences, plan.targets)
    const afterWednesday = reviewed.days.find((day) => day.day === 'Wednesday').workouts.find((workout) => workout.activity === 'running').distanceKm
    expect(afterWednesday).toBeLessThan(beforeWednesday)
    expect(getTotals(reviewed.days).runningKm).toBe(plan.targets.running)
    expect(reviewed.review.adjustments.some((item) => item.activity === 'running')).toBe(true)
  })

  it('adjusts later cycling after an over-completed early ride', () => {
    const plan = generateWeeklyPlan(defaults)
    const tuesdayRide = plan.days.find((day) => day.day === 'Tuesday').workouts.find((workout) => workout.activity === 'cycling')
    tuesdayRide.completed = true
    tuesdayRide.actualDistanceKm = tuesdayRide.distanceKm + 5
    const reviewed = reviewRemainingWeek(plan.days, plan.effectivePreferences, plan.targets)
    expect(getTotals(reviewed.days).cyclingKm).toBe(plan.targets.cycling)
    expect(reviewed.review.cyclingUnallocatedKm).toBe(0)
  })

  it('does not adjust locked or completed workouts during review', () => {
    const plan = generateWeeklyPlan(defaults)
    const mondayRun = plan.days.find((day) => day.day === 'Monday').workouts.find((workout) => workout.activity === 'running')
    const wednesdayRun = plan.days.find((day) => day.day === 'Wednesday').workouts.find((workout) => workout.activity === 'running')
    mondayRun.completed = true
    mondayRun.actualDistanceKm = mondayRun.distanceKm + 2
    wednesdayRun.locked = true
    const reviewed = reviewRemainingWeek(plan.days, plan.effectivePreferences, plan.targets)
    const reviewedWednesday = reviewed.days.find((day) => day.day === 'Wednesday').workouts.find((workout) => workout.id === wednesdayRun.id)
    expect(reviewedWednesday.distanceKm).toBe(wednesdayRun.distanceKm)
    expect(reviewed.days.find((day) => day.day === 'Monday').workouts.find((workout) => workout.id === mondayRun.id).actualDistanceKm).toBe(mondayRun.actualDistanceKm)
  })

  it('accepts completed totals inside the range without reporting preferred-target shortfall', () => {
    const reviewPreferences = { ...defaults, cyclingMinKm: 60, cyclingPreferredKm: 70, cyclingMaxKm: 80 }
    const plan = generateWeeklyPlan(reviewPreferences)
    const workouts = plan.days.flatMap((day) => day.workouts)
    for (const workout of workouts) {
      workout.completed = true
      if (workout.distanceKm != null) workout.actualDistanceKm = workout.distanceKm
    }
    const firstRun = workouts.find((workout) => workout.activity === 'running')
    const firstRide = workouts.find((workout) => workout.activity === 'cycling')
    firstRun.actualDistanceKm -= 1
    firstRide.actualDistanceKm -= 8
    const reviewed = reviewRemainingWeek(plan.days, reviewPreferences, plan.targets)
    expect(getTotals(reviewed.days).runningKm).toBe(59)
    expect(getTotals(reviewed.days).cyclingKm).toBe(62)
    expect(reviewed.review.runningUnallocatedKm).toBe(0)
    expect(reviewed.review.cyclingUnallocatedKm).toBe(0)
  })
})
