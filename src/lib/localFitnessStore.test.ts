import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAutomaticBackupCount, newestFitnessState, saveAutomaticBackup } from './localFitnessStore.js'
import type { PersistedFitnessState } from './localFitnessStore.js'


afterEach(() => vi.unstubAllGlobals())

function mockStorage() {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
}
const state = (clientUpdatedAt: number, activeWeekStart: string): PersistedFitnessState => ({
  clientUpdatedAt,
  activeWeekStart,
  preferences: {} as PersistedFitnessState['preferences'],
  history: {},
})

describe('newestFitnessState', () => {
  it('keeps a newer local revision instead of allowing stale cloud data to replace it', () => {
    expect(newestFitnessState(state(200, 'local'), state(100, 'cloud'))?.activeWeekStart).toBe('local')
  })

  it('accepts a newer cloud revision for cross-device changes', () => {
    expect(newestFitnessState(state(100, 'local'), state(200, 'cloud'))?.activeWeekStart).toBe('cloud')
  })

  it('keeps rolling backups while replacing rapid successive saves', () => {
    mockStorage()
    saveAutomaticBackup(state(1_000, 'first'))
    saveAutomaticBackup(state(2_000, 'updated'))
    expect(getAutomaticBackupCount()).toBe(1)
    saveAutomaticBackup(state(1_000_000, 'later'))
    expect(getAutomaticBackupCount()).toBe(2)
  })
})