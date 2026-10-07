export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

export type DayName = typeof DAY_NAMES[number]
export type ActivityType = 'running' | 'cycling' | 'strength'
export type Intensity = 'easy' | 'moderate' | 'hard'
export type Fatigue = 'low' | 'normal' | 'high'

export interface Workout {
  id: string
  activity: ActivityType
  name: string
  distanceKm?: number
  actualDistanceKm?: number | null
  durationMinutes: number
  startPeriod?: string
  intensity: Intensity
  tags: string[]
  completed: boolean
  locked: boolean
  notes?: string
  source?: 'manual' | 'generated' | 'strava'
  stravaActivityId?: string
}

export interface PlanDay {
  day: DayName
  type: string
  capacity: number
  workouts: Workout[]
}

export interface Preferences {
  workFromHomeDays: DayName[]
  busyDays: DayName[]
  unavailableDays: DayName[]
  runningMinKm: number
  runningPreferredKm: number
  runningMaxKm: number
  cyclingMinKm: number
  cyclingPreferredKm: number
  cyclingMaxKm: number
  strengthSessions: number
  previousRunningKm: number
  previousCyclingKm: number
  previousLongRunKm: number
  includeSpeedSession: boolean
  includeLegSession: boolean
  includeCoreSession: boolean
  allowWeekdayDoubles: boolean
  preferredLongRunDay: DayName
  preferredLongRideDay: DayName
  previousWeekFatigue: Fatigue
  restDay: DayName | null
}

export interface Totals {
  runningKm: number
  cyclingKm: number
  strengthSessions: number
}

export type Validation = Record<string, boolean>

export interface ReviewAdjustment {
  day: DayName
  workoutId: string
  name: string
  activity: ActivityType
  before: number
  after: number
}

export interface PlanReview {
  runningUnallocatedKm: number
  cyclingUnallocatedKm: number
  latestCompletedDay: DayName | null
  adjustments: ReviewAdjustment[]
}

export interface WeeklyPlan {
  weekStart: string
  days: PlanDay[]
  totals: Totals
  validation: Validation
  effectivePreferences: Preferences
  targets: { running: number, cycling: number }
  note: string
  review?: PlanReview
}

export interface TrainingHistory {
  [weekStart: string]: WeeklyPlan
}
