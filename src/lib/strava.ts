import { auth } from './firebase.js'

export interface StravaActivity {
  id: string
  name: string
  type: string
  date: string
  distanceKm: number
  durationSeconds: number
  elapsedSeconds?: number
  elevationGainM?: number
  averageHeartRate?: number
  maxHeartRate?: number
  averagePowerWatts?: number
  trainer?: boolean
  commute?: boolean
}

export interface StravaStatus {
  connected: boolean
  athlete?: { id: number, firstname: string, lastname: string, profile_medium?: string } | null
  scope?: string | null
}

const configuredBase = import.meta.env.VITE_STRAVA_API_URL?.replace(/\/$/, '')
export const stravaConfigured = Boolean(configuredBase)

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!configuredBase) throw new Error('Strava API is not configured yet.')
  const user = auth?.currentUser
  if (!user) throw new Error('Sign in with Google before connecting Strava.')
  const token = await user.getIdToken()
  const response = await fetch(`${configuredBase}${path}`, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || 'Strava request failed.')
  return data as T
}

export const stravaStatus = () => request<StravaStatus>('/api/strava/status')
export async function connectStrava(): Promise<void> {
  const { url } = await request<{ url: string }>('/api/strava/connect', { method: 'POST' })
  location.assign(url)
}
export interface StravaActivitiesPage {
  activities: StravaActivity[]
  hasMore: boolean
  syncedAt: string
}

export const loadStravaActivities = (page = 1, perPage = 100) => request<StravaActivitiesPage>(`/api/strava/activities?page=${page}&per_page=${perPage}`)

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

export async function loadAllStravaActivities(onProgress?: (count: number) => void): Promise<{ activities: StravaActivity[], syncedAt: string }> {
  const activities: StravaActivity[] = []
  const seen = new Set<string>()
  let page = 1
  let syncedAt = new Date().toISOString()

  while (page <= 1000) {
    const result = await loadStravaActivities(page, 100)
    for (const activity of result.activities) {
      if (!seen.has(activity.id)) {
        seen.add(activity.id)
        activities.push(activity)
      }
    }
    syncedAt = result.syncedAt
    onProgress?.(activities.length)
    if (!result.hasMore) break
    page += 1
    await wait(250)
  }

  return { activities, syncedAt }
}
export const disconnectStrava = () => request<StravaStatus>('/api/strava/disconnect', { method: 'POST' })