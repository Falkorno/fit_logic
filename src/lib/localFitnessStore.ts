import type { FitnessState } from './fitnessStore.js'

export interface PersistedFitnessState extends FitnessState {
  clientUpdatedAt: number
}

const BASE_KEY = 'pulse-fitness-state-v1'
const BACKUP_KEY = 'pulse-fitness-backups-v1'
const keyFor = (userId?: string | null) => userId ? `${BASE_KEY}:${userId}` : BASE_KEY

export function loadLocalFitnessState(userId?: string | null): PersistedFitnessState | null {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedFitnessState
    if (!parsed.preferences || !parsed.history || !parsed.activeWeekStart) return null
    return { ...parsed, clientUpdatedAt: Number(parsed.clientUpdatedAt) || 0 }
  } catch {
    return null
  }
}

export function saveLocalFitnessState(state: PersistedFitnessState, userId?: string | null): void {
  try {
    const serialized = JSON.stringify(state)
    localStorage.setItem(BASE_KEY, serialized)
    if (userId) localStorage.setItem(keyFor(userId), serialized)
  } catch (error) {
    console.error('Local planner backup failed:', error)
  }
}

export function newestFitnessState(...states: Array<PersistedFitnessState | null | undefined>): PersistedFitnessState | null {
  return states.filter((state): state is PersistedFitnessState => Boolean(state))
    .sort((a, b) => b.clientUpdatedAt - a.clientUpdatedAt)[0] ?? null
}
export function saveAutomaticBackup(state: PersistedFitnessState): void {
  try {
    const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]') as PersistedFitnessState[]
    const latest = backups[0]
    const recent = latest && state.clientUpdatedAt - latest.clientUpdatedAt < 15 * 60 * 1000
    const next = recent ? [state, ...backups.slice(1)] : [state, ...backups]
    localStorage.setItem(BACKUP_KEY, JSON.stringify(next.slice(0, 10)))
  } catch (error) {
    console.error('Automatic planner backup failed:', error)
  }
}

export function getAutomaticBackupCount(): number {
  try { return (JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]') as unknown[]).length } catch { return 0 }
}