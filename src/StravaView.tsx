import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { Activity, Bike, ChevronLeft, ChevronRight, Clock3, Dumbbell, Link2, LoaderCircle, Mountain, RefreshCw, Unlink } from 'lucide-react'
import { connectStrava, disconnectStrava, loadAllStravaActivities, stravaConfigured, stravaStatus } from './lib/strava.js'
import type { StravaActivity } from './lib/strava.js'
import { reportAppIssue } from './lib/errorMonitor.js'

interface Props { user: User | null, activities: StravaActivity[], onActivities: (activities: StravaActivity[]) => void }
const PAGE_SIZE = 20
type ActivityFilter = 'all' | 'running' | 'cycling' | 'strength' | 'other'
const kind = (type = '') => /ride|cycling/i.test(type) ? 'cycling' : /run/i.test(type) ? 'running' : /weighttraining|workout|crossfit|strength/i.test(type) ? 'strength' : 'other'
const formatDuration = (seconds: number) => { const minutes = Math.round(seconds / 60), hours = Math.floor(minutes / 60); return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m` }
const formatDistance = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
const runEnvironment = (activity: StravaActivity) => activity.trainer || /virtual|indoor|treadmill/i.test(`${activity.type} ${activity.name}`) ? 'Indoor' : 'Outdoor'

export default function StravaView({ user, activities, onActivities }: Props) {
  const [connection, setConnection] = useState<{ loading: boolean, connected: boolean, athlete?: { firstname: string } | null }>({ loading: true, connected: false })
  const [loading, setLoading] = useState(false)
  const [loadedCount, setLoadedCount] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')
  const syncingRef = useRef(false)
  const lastSuccessfulSyncRef = useRef(0)
  const onActivitiesRef = useRef(onActivities)

  useEffect(() => { onActivitiesRef.current = onActivities }, [onActivities])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.has('strava_error')) setError('Strava connection was not completed.')
    if (params.has('strava')) history.replaceState(null, '', location.pathname)
    if (!user || !stravaConfigured) { setConnection({ loading: false, connected: false }); return }
    stravaStatus().then(status => { setConnection({ ...status, loading: false }); if (status.connected) sync() }).catch(reason => { setConnection({ loading: false, connected: false }); setError(reason.message); reportAppIssue('strava', reason) })
  }, [user])

  const activityCounts = useMemo(() => activities.reduce((counts, activity) => {
    counts[kind(activity.type)] += 1
    return counts
  }, { running: 0, cycling: 0, strength: 0, other: 0 }), [activities])
  const filteredActivities = useMemo(() => activityFilter === 'all' ? activities : activities.filter((activity) => kind(activity.type) === activityFilter), [activities, activityFilter])
  const pageCount = Math.max(1, Math.ceil(filteredActivities.length / PAGE_SIZE))
  const visibleActivities = useMemo(() => filteredActivities.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredActivities, page])
  useEffect(() => setPage(current => Math.min(current, pageCount)), [pageCount])
  useEffect(() => setPage(1), [activityFilter])

  async function sync() {
    if (syncingRef.current) return
    syncingRef.current = true
    setLoading(true)
    setLoadedCount(0)
    setError('')
    try {
      const data = await loadAllStravaActivities(setLoadedCount)
      onActivitiesRef.current(data.activities)
      lastSuccessfulSyncRef.current = Date.now()
      setSyncedAt(data.syncedAt)
      setPage(1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not sync Strava.')
      reportAppIssue('strava', reason)
    } finally {
      syncingRef.current = false
      setLoading(false)
      setLoadedCount(null)
    }
  }

  useEffect(() => {
    if (!user || !connection.connected) return
    const refreshIfStale = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastSuccessfulSyncRef.current >= 5 * 60 * 1000) void sync()
    }
    const interval = window.setInterval(refreshIfStale, 15 * 60 * 1000)
    document.addEventListener('visibilitychange', refreshIfStale)
    window.addEventListener('focus', refreshIfStale)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshIfStale)
      window.removeEventListener('focus', refreshIfStale)
    }
  }, [user, connection.connected])
  async function disconnect() {
    if (!confirm('Disconnect Strava from Pulse?')) return
    setLoading(true)
    try {
      await disconnectStrava()
      setConnection({ loading: false, connected: false })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not disconnect Strava.')
      reportAppIssue('strava', reason)
    } finally {
      setLoading(false)
    }
  }

  const totals = useMemo(() => filteredActivities.reduce((value, item) => {
    value.count++
    value.seconds += item.durationSeconds || 0
    value.elevation += item.elevationGainM || 0
    value.distance += item.distanceKm || 0
    return value
  }, { count: 0, seconds: 0, elevation: 0, distance: 0 }), [filteredActivities])
  const firstVisible = filteredActivities.length ? (page - 1) * PAGE_SIZE + 1 : 0
  const lastVisible = Math.min(page * PAGE_SIZE, filteredActivities.length)

  return <div className="space-y-4">
    <section className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#203747] p-3 shadow-sm">
      <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-[#fc4c02]"><Link2 size={18} /></span><div className="min-w-0"><h3 className="truncate text-sm font-extrabold">{connection.loading ? 'Checking Strava…' : connection.connected ? `${connection.athlete?.firstname || 'Strava'} connected` : 'Connect Strava'}</h3><p className="truncate text-xs text-slate-300">{!stravaConfigured ? 'Add the Strava API environment settings first' : !user ? 'Sign in with Google first' : syncedAt ? `Synced ${new Date(syncedAt).toLocaleString()}` : 'Import completed training automatically'}</p></div></div>
      {connection.connected ? <div className="flex shrink-0"><button disabled={loading} onClick={sync} aria-label="Refresh activities" className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 disabled:opacity-50">{loading ? <LoaderCircle size={17} className="animate-spin" /> : <RefreshCw size={17} />}</button><button onClick={disconnect} aria-label="Disconnect Strava" className="grid h-11 w-11 place-items-center text-slate-300"><Unlink size={17} /></button></div> : <button disabled={!user || !stravaConfigured || connection.loading} onClick={() => connectStrava().catch(reason => { setError(reason.message); reportAppIssue('strava', reason) })} className="h-11 shrink-0 rounded-xl bg-[#fc4c02] px-4 text-xs font-extrabold text-white disabled:opacity-40">Connect</button>}
    </section>
    {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
    <section className="grid grid-cols-3 gap-2"><Total icon={<Activity size={16} />} value={String(totals.count)} label="Activities" /><Total icon={<Clock3 size={16} />} value={formatDuration(totals.seconds)} label="Moving" /><Total icon={<Mountain size={16} />} value={`${Math.round(totals.elevation)} m`} label="Elevation" /></section>
    <section>
      <div className="mb-3 flex items-end justify-between gap-3"><div><h3 className="font-extrabold">Recent activities</h3><p className="mt-0.5 text-xs text-slate-300">{filteredActivities.length ? `Showing ${firstVisible}–${lastVisible} of ${filteredActivities.length}` : activityFilter === 'all' ? 'Your imported Strava history' : 'No matching activities'}</p></div><span className="shrink-0 text-xs text-slate-300">{loading && loadedCount !== null ? `${loadedCount} loading…` : `${activities.length} loaded`}</span></div>
      <div className="mb-3 grid grid-cols-5 gap-1 rounded-xl border border-white/10 bg-[#203747] p-1 sm:w-fit" role="group" aria-label="Filter Strava activities">{([['all', 'All', activities.length], ['running', 'Run', activityCounts.running], ['cycling', 'Ride', activityCounts.cycling], ['strength', 'Strength', activityCounts.strength], ['other', 'Other', activityCounts.other]] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={activityFilter === value} onClick={() => setActivityFilter(value)} className={`flex h-8 min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 text-[10px] font-bold transition sm:min-w-16 ${activityFilter === value ? 'bg-emerald-500 text-[#172A3A] shadow-sm' : 'text-slate-300 hover:bg-white/5'}`}><span className="truncate">{label}</span><span className={`shrink-0 text-[9px] ${activityFilter === value ? 'text-[#172A3A]/65' : 'text-slate-500'}`}>{count}</span></button>)}</div>
      {visibleActivities.length ? <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#203747] shadow-sm"><div className="divide-y divide-white/10">{visibleActivities.map(item => <ActivityCard key={item.id} activity={item} />)}</div></div> : activities.length > 0 && <p className="rounded-2xl border border-dashed border-white/10 bg-[#203747] p-6 text-center text-sm text-slate-300">No {activityFilter} activities found.</p>}
      {pageCount > 1 && <nav aria-label="Strava activity pages" className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-[#203747] p-2"><button type="button" disabled={page === 1} onClick={() => setPage(current => Math.max(1, current - 1))} className="flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:opacity-30"><ChevronLeft size={16} /> Previous</button><span className="text-xs font-bold text-slate-300">Page {page} of {pageCount}</span><button type="button" disabled={page === pageCount} onClick={() => setPage(current => Math.min(pageCount, current + 1))} className="flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:opacity-30">Next <ChevronRight size={16} /></button></nav>}
      {connection.connected && !loading && !activities.length && <p className="rounded-2xl bg-[#203747] p-8 text-center text-sm text-slate-300">No Strava activities found.</p>}
    </section>
  </div>
}

function Total({ icon, value, label }: { icon: React.ReactNode, value: string, label: string }) {
  return <article className="min-w-0 rounded-2xl border border-white/5 bg-[#203747] p-3 shadow-sm"><span className="text-emerald-500">{icon}</span><p className="mt-2 truncate text-sm font-extrabold">{value}</p><p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-300">{label}</p></article>
}

function ActivityCard({ activity }: { activity: StravaActivity }) {
  const type = kind(activity.type)
  const Icon = type === 'running' ? Activity : type === 'strength' ? Dumbbell : Bike
  const environment = type === 'running' ? runEnvironment(activity) : null
  const iconStyle = type === 'running' ? 'bg-emerald-500/15 text-emerald-500' : type === 'strength' ? 'bg-amber-500/15 text-amber-400' : 'bg-sky-500/15 text-sky-500'
  const date = new Date(activity.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const extra = activity.averageHeartRate
    ? `${Math.round(activity.averageHeartRate)} bpm`
    : activity.elevationGainM ? `${Math.round(activity.elevationGainM)} m elevation` : ''

  return <article className="flex min-w-0 items-center gap-2.5 px-3 py-2.5 transition hover:bg-white/5 sm:gap-3">
    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${iconStyle}`}><Icon size={15} /></span>
    <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-1.5"><h4 className="truncate text-sm font-bold text-white">{activity.name}</h4>{environment && <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${environment === 'Indoor' ? 'bg-cyan-400/15 text-cyan-300' : 'bg-emerald-500/15 text-emerald-400'}`}>{environment}</span>}{activity.commute && <span className="shrink-0 rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">Commute</span>}</div><p className="mt-0.5 truncate text-[11px] text-slate-400">{date} · {activity.type}{extra ? ` · ${extra}` : ''}</p></div>
    <div className="shrink-0 text-right"><p className="text-sm font-extrabold text-white">{activity.distanceKm > 0 ? `${formatDistance(activity.distanceKm)} km` : formatDuration(activity.durationSeconds)}</p>{activity.distanceKm > 0 && <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{formatDuration(activity.durationSeconds)}</p>}</div>
  </article>
}