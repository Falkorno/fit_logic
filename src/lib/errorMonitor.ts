export interface AppIssue {
  id: string
  source: 'app' | 'firebase' | 'strava' | 'pwa'
  message: string
  occurredAt: string
}

const STORAGE_KEY = 'pulse-app-issues-v1'
export const ISSUE_EVENT = 'pulse:issues-changed'

export function getAppIssues(): AppIssue[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as AppIssue[]
  } catch {
    return []
  }
}

export function reportAppIssue(source: AppIssue['source'], error: unknown): void {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error')
  const current = getAppIssues()
  const previous = current[0]
  if (previous?.source === source && previous.message === message && Date.now() - new Date(previous.occurredAt).getTime() < 60_000) return
  const issue: AppIssue = { id: crypto.randomUUID(), source, message, occurredAt: new Date().toISOString() }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([issue, ...current].slice(0, 25))) } catch { /* storage may be unavailable */ }
  window.dispatchEvent(new CustomEvent(ISSUE_EVENT))
}

export function clearAppIssues(): void {
  localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new CustomEvent(ISSUE_EVENT))
}

export function installGlobalErrorMonitoring(): void {
  window.addEventListener('error', event => reportAppIssue('app', event.error || event.message))
  window.addEventListener('unhandledrejection', event => reportAppIssue('app', event.reason))
}