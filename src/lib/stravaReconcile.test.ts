import { describe, expect, it } from 'vitest'
import { generateWeeklyPlan } from '../planner/generatePlan.js'
import type { Preferences } from '../planner/types.js'
import { reconcileStravaHistory } from './stravaReconcile.js'

const preferences: Preferences = { workFromHomeDays: ['Tuesday','Thursday'], busyDays: ['Wednesday'], unavailableDays: [], runningMinKm: 20, runningPreferredKm: 25, runningMaxKm: 30, cyclingMinKm: 30, cyclingPreferredKm: 40, cyclingMaxKm: 50, strengthSessions: 3, previousRunningKm: 20, previousCyclingKm: 40, previousLongRunKm: 10, includeSpeedSession: false, includeLegSession: false, includeCoreSession: true, allowWeekdayDoubles: true, preferredLongRunDay: 'Saturday', preferredLongRideDay: 'Tuesday', previousWeekFatigue: 'normal', restDay: null }

describe('reconcileStravaHistory', () => {
  it('completes a matching planned activity without duplicating it', () => {
    const plan = generateWeeklyPlan(preferences, '2026-10-05')
    const day = plan.days.find(value => value.workouts.some(workout => workout.activity === 'running'))!
    const workout = day.workouts.find(value => value.activity === 'running')!
    const dayIndex = plan.days.indexOf(day)
    const date = new Date('2026-10-05T12:00:00')
    date.setDate(date.getDate() + dayIndex)
    const result = reconcileStravaHistory({ [plan.weekStart]: plan }, [{ id:'123', name:'Morning Run', type:'Run', date:date.toISOString(), distanceKm:workout.distanceKm || 0, durationSeconds:workout.durationMinutes * 60 }], preferences)
    const reconciled = result[plan.weekStart].days[dayIndex].workouts
    expect(reconciled).toHaveLength(day.workouts.length)
    expect(reconciled.find(value => value.id === workout.id)).toMatchObject({ completed:true, source:'strava', stravaActivityId:'123' })
  })

  it('adds an unmatched completed activity once', () => {
    const plan = generateWeeklyPlan(preferences, '2026-10-05')
    const activity = { id:'456', name:'Extra Ride', type:'Ride', date:'2026-10-05T08:00:00', distanceKm:12, durationSeconds:1800 }
    const once = reconcileStravaHistory({ [plan.weekStart]: plan }, [activity], preferences)
    const twice = reconcileStravaHistory(once, [activity], preferences)
    const linked = twice[plan.weekStart].days.flatMap(day => day.workouts).filter(workout => workout.stravaActivityId === '456')
    expect(linked).toHaveLength(1)
    expect(linked[0]).toMatchObject({ completed:true, activity:'cycling', source:'strava' })
  })

  it('matches the closest same-day plan and records the actual Strava result', () => {
    const plan = generateWeeklyPlan(preferences, '2026-10-05')
    const monday = plan.days[0]
    monday.workouts = [
      { id:'short', activity:'running', name:'Easy run', distanceKm:5, durationMinutes:30, intensity:'easy', tags:[], completed:false, locked:false },
      { id:'long', activity:'running', name:'Long run', distanceKm:10, durationMinutes:60, intensity:'easy', tags:[], completed:false, locked:false },
    ]
    const result = reconcileStravaHistory({ [plan.weekStart]: plan }, [{ id:'789', name:'Morning Run', type:'Run', date:'2026-10-05T08:00:00', distanceKm:12, durationSeconds:3900 }], preferences)
    const workouts = result[plan.weekStart].days[0].workouts
    expect(workouts.find(workout => workout.id === 'short')?.completed).toBe(false)
    expect(workouts.find(workout => workout.id === 'long')).toMatchObject({ completed:true, distanceKm:10, actualDistanceKm:12, durationMinutes:65, source:'strava', stravaActivityId:'789' })
  })

  it('creates an activity-only historical week instead of inventing a full plan', () => {
    const result = reconcileStravaHistory({}, [{ id:'history', name:'Historical Run', type:'Run', date:'2026-09-14T08:00:00', distanceKm:8, durationSeconds:2880 }], preferences)
    const week = result['2026-09-14']
    expect(week.days.flatMap(day => day.workouts)).toHaveLength(1)
    expect(week.days[0].workouts[0]).toMatchObject({ name:'Historical Run', completed:true, actualDistanceKm:8, source:'strava' })
  })

  it('asks before linking a large distance mismatch', () => {
    const plan = generateWeeklyPlan(preferences, '2026-10-05')
    const monday = plan.days[0]
    monday.workouts = [{ id:'planned', activity:'running', name:'Easy run', distanceKm:5, durationMinutes:30, intensity:'easy', tags:[], completed:false, locked:false }]
    const confirmations: string[] = []
    const result = reconcileStravaHistory({ [plan.weekStart]: plan }, [{ id:'long-run', name:'Unexpected Long Run', type:'Run', date:'2026-10-05T08:00:00', distanceKm:20, durationSeconds:7200 }], preferences, (planned, activity) => {
      confirmations.push(`${planned.id}:${activity.id}`)
      return false
    })
    const workouts = result[plan.weekStart].days[0].workouts
    expect(confirmations).toEqual(['planned:long-run'])
    expect(workouts.find(workout => workout.id === 'planned')?.completed).toBe(false)
    expect(workouts.find(workout => workout.stravaActivityId === 'long-run')).toMatchObject({ name:'Unexpected Long Run', completed:true, actualDistanceKm:20 })
  })})