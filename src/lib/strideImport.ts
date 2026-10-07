import { DAYS } from '../planner/generatePlan.js'
import { getTotals, validatePlan } from '../planner/validator.js'
import type { ActivityType, Intensity, PlanDay, Preferences, TrainingHistory, Workout } from '../planner/types.js'

interface StrideSession { id?: string; date: string; title?: string; category?: string; intensity?: string; completed?: boolean; skipped?: boolean; plannedDistanceKm?: number | null; actualDistanceKm?: number | null; plannedDurationMinutes?: number | null; actualDurationMinutes?: number | null; stravaActivityId?: string | number | null }
interface StrideWeek { startDate: string, sessions?: StrideSession[] }

const classify = (session: StrideSession): ActivityType | null => {
  const value = `${session.category ?? ''} ${session.title ?? ''}`
  if (/strength|weights?|core|arms|biceps|triceps|chest|back|legs|shoulders/i.test(value)) return 'strength'
  if (/bike|cycling|cycle|ride|spin/i.test(value)) return 'cycling'
  if (/run|running|speed|interval/i.test(value)) return 'running'
  return null
}
const tagsFor = (session: StrideSession): string[] => {
  const value = `${session.category ?? ''} ${session.title ?? ''}`
  return [/long/i.test(value) && 'Long', /recovery/i.test(value) && 'Recovery', /speed|interval/i.test(value) && 'Speed', /lunch/i.test(value) && 'Lunch', /legs|lower-body/i.test(value) && 'Legs', /core/i.test(value) && 'Core'].filter((value): value is string => Boolean(value))
}
const dayIndex = (weekStart: string, date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86_400_000)
function toWorkout(session: StrideSession, activity: ActivityType): Workout {
  const plannedDistance = Number(session.plannedDistanceKm) || undefined
  const actualDistance = session.actualDistanceKm == null ? null : Number(session.actualDistanceKm)
  const duration = Number(session.actualDurationMinutes || session.plannedDurationMinutes) || (plannedDistance ? Math.round(plannedDistance * (activity === 'running' ? 6 : 2.5)) : 45)
  return { id: session.id || crypto.randomUUID(), activity, name: session.title || session.category || 'Imported workout', ...(plannedDistance == null ? {} : { distanceKm: plannedDistance }), actualDistanceKm: actualDistance, durationMinutes: duration, intensity: (['easy', 'moderate', 'hard'].includes(session.intensity || '') ? session.intensity : 'moderate') as Intensity, tags: tagsFor(session), completed: Boolean(session.completed), locked: false, notes: session.skipped ? 'Skipped in Stride' : undefined, source: session.stravaActivityId ? 'strava' : 'manual', ...(session.stravaActivityId ? { stravaActivityId: String(session.stravaActivityId) } : {}) }
}
export function importStrideHistory(weeks: StrideWeek[], preferences: Preferences, beforeWeek: string): TrainingHistory {
  return Object.fromEntries(weeks.filter(week => /^\d{4}-\d{2}-\d{2}$/.test(week.startDate) && week.startDate < beforeWeek).sort((a, b) => a.startDate.localeCompare(b.startDate)).map(week => {
    const grouped = DAYS.map((day): PlanDay => ({ day, type: 'Imported', capacity: 3, workouts: [] }))
    for (const session of week.sessions ?? []) { const index = dayIndex(week.startDate, session.date); const activity = classify(session); if (index < 0 || index > 6 || !activity) continue; grouped[index].workouts.push(toWorkout(session, activity)) }
    for (const day of grouped) day.capacity = Math.max(3, day.workouts.length)
    const totals = getTotals(grouped)
    return [week.startDate, { weekStart: week.startDate, days: grouped, totals, validation: validatePlan(grouped, preferences), effectivePreferences: preferences, targets: { running: totals.runningKm, cycling: totals.cyclingKm }, note: 'Imported from Stride backup.' }]
  }))
}