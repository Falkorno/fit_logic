import { DAYS, generateWeeklyPlan } from '../planner/generatePlan.js'
import { getTotals, validatePlan } from '../planner/validator.js'
import type { ActivityType, Preferences, TrainingHistory, Workout } from '../planner/types.js'
import type { StravaActivity } from './strava.js'

const kind = (type = ''): ActivityType | null => /ride|cycling/i.test(type) ? 'cycling' : /run/i.test(type) ? 'running' : /weighttraining|workout|crossfit|strength/i.test(type) ? 'strength' : null
const localDate = (value: string) => String(value).slice(0, 10)
const dateFromIso = (value: string) => { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day) }
const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const weekFor = (value: string) => { const date = dateFromIso(localDate(value)); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return isoDate(date) }
const dayFor = (value: string) => DAYS[(dateFromIso(localDate(value)).getDay() + 6) % 7]

const emptyWeek = (preferences: Preferences, weekStart: string) => {
  const plan = generateWeeklyPlan(preferences, weekStart)
  plan.days = plan.days.map(day => ({ ...day, capacity: 0, workouts: [] }))
  plan.totals = getTotals(plan.days)
  plan.validation = validatePlan(plan.days, plan.effectivePreferences)
  plan.note = ''
  return plan
}

const closestPlannedMatch = (workouts: Workout[], activityType: ActivityType, actualDistanceKm: number) => {
  const candidates = workouts.filter(workout => !workout.completed && workout.activity === activityType)
  if (candidates.length < 2 || activityType === 'strength' || actualDistanceKm <= 0) return candidates[0]
  return candidates.reduce((closest, workout) => {
    const closestDifference = Math.abs((closest.distanceKm ?? actualDistanceKm) - actualDistanceKm)
    const difference = Math.abs((workout.distanceKm ?? actualDistanceKm) - actualDistanceKm)
    return difference < closestDifference ? workout : closest
  })
}

export type ConfirmStravaMatch = (planned: Workout, activity: StravaActivity) => boolean

export function reconcileStravaHistory(history: TrainingHistory, activities: StravaActivity[], preferences: Preferences, confirmMismatch?: ConfirmStravaMatch): TrainingHistory {
  const next = structuredClone(history)
  const known = new Set(Object.values(next).flatMap(week => week.days).flatMap(day => day.workouts).map(workout => workout.stravaActivityId).filter(Boolean))
  for (const activity of activities) {
    if (known.has(activity.id)) continue
    const activityType = kind(activity.type)
    if (!activityType) continue
    const weekStart = weekFor(activity.date)
    const plan = next[weekStart] ?? emptyWeek(preferences, weekStart)
    const day = plan.days.find(item => item.day === dayFor(activity.date))
    if (!day) continue
    const candidate = closestPlannedMatch(day.workouts, activityType, activity.distanceKm)
    const plannedDistance = candidate?.distanceKm
    const distanceDifference = plannedDistance != null && activity.distanceKm > 0 ? Math.abs(plannedDistance - activity.distanceKm) : 0
    const needsConfirmation = Boolean(candidate && activityType !== 'strength' && plannedDistance && distanceDifference > Math.max(2, plannedDistance * 0.4))
    const match = candidate && (!needsConfirmation || confirmMismatch?.(candidate, activity)) ? candidate : undefined
    if (match) {
      Object.assign(match, { completed: true, actualDistanceKm: activity.distanceKm > 0 ? activity.distanceKm : match.distanceKm ?? null, durationMinutes: Math.max(1, Math.round(activity.durationSeconds / 60)), source: 'strava', stravaActivityId: activity.id })
    } else {
      const workout: Workout = { id: crypto.randomUUID(), activity: activityType, name: activity.name, ...(activityType === 'strength' && !activity.distanceKm ? {} : { distanceKm: activity.distanceKm }), actualDistanceKm: activity.distanceKm || null, durationMinutes: Math.max(1, Math.round(activity.durationSeconds / 60)), startPeriod: 'Completed', intensity: 'moderate', tags: [], completed: true, locked: false, source: 'strava', stravaActivityId: activity.id }
      day.workouts.push(workout)
      day.capacity = Math.max(day.capacity, day.workouts.length)
    }
    plan.totals = getTotals(plan.days)
    plan.validation = validatePlan(plan.days, plan.effectivePreferences ?? preferences)
    next[weekStart] = plan
    known.add(activity.id)
  }
  return next
}