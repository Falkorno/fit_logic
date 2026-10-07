import { describe, expect, it } from 'vitest'
import { cleanFitnessState } from './fitnessStore.js'
import type { FitnessState } from './fitnessStore.js'

const state = {
  preferences: { optional: undefined },
  history: {
    '2026-10-05': {
      days: [{ workouts: [{ name: 'Run', notes: undefined }] }],
    },
  },
  activeWeekStart: '2026-10-05',
} as unknown as FitnessState

describe('cleanFitnessState', () => {
  it('removes nested undefined values before a Firestore write without mutating local state', () => {
    const cleaned = cleanFitnessState(state) as unknown as Record<string, unknown>

    expect(cleaned).toEqual({
      preferences: {},
      history: { '2026-10-05': { days: [{ workouts: [{ name: 'Run' }] }] } },
      activeWeekStart: '2026-10-05',
    })
    expect((state.preferences as unknown as Record<string, unknown>)).toHaveProperty('optional')
  })
})