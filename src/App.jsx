import React, { useEffect, useState, useRef, useCallback } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { GAUGES } from './config/gauges'
import { fetchUSGSGauges } from './lib/usgs'
import { calculateRates, getAlertLevel, getHighestAlert, ALERT_LEVELS } from './lib/alertEngine'
import { saveReading, getReadings, pruneReadings } from './lib/database'
import { fetchNWSAlerts } from './lib/nwsAlerts'
import { Activity, AlertTriangle, Clock, WifiOff, Database, RefreshCw } from 'lucide-react'

import Dashboard from './pages/Dashboard'
import GaugeDetail from './pages/GaugeDetail'
import NWSAlertBanner from './components/NWSAlertBanner'

function dataAge(isoTime) {
  if (!isoTime) return null
  const mins = Math.floor((Date.now() - new Date(isoTime).getTime()) / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m ago`
}

export default function App() {
  const [data, setData]           = useState({})
  const [lastUpdate, setLastUpdate] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [isStale, setIsStale]     = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [nwsAlerts, setNwsAlerts] = useState([])

  const usgsResponded = useRef(false)
  const fetchInFlight = useRef(false)

  // ── Core data fetch ──────────────────────────────────────────
  const doFetchData = useCallback(async () => {
    if (fetchInFlight.current) return  // prevent overlapping calls
    fetchInFlight.current = true
    try {
      const ids = GAUGES.map(g => g.id)
      const usgsData = await fetchUSGSGauges(ids)

      const processed = {}
      for (const g of GAUGES) {
        const d = usgsData[g.id]
        if (!d) continue
        const rates = calculateRates(d.history || [], d)
        const alert = getAlertLevel(rates)
        processed[g.id] = { ...d, alert, rates }
        if (d.time) saveReading(g.id, { height: d.height, flow: d.flow, time: d.time })
      }

      usgsResponded.current = true
      setData(processed)
      setLastUpdate(new Date())
      setIsStale(false)
      setFetchError(false)
    } catch (err) {
      console.error('USGS fetch failed:', err)
      setFetchError(true)
    } finally {
      fetchInFlight.current = false
      setLoading(false)
    }
  }, [])

  const doFetchAlerts = useCallback(async () => {
    const alerts = await fetchNWSAlerts()
    setNwsAlerts(alerts)
  }, [])

  // ── Load IndexedDB cache → render immediately while USGS loads ─
  const loadCachedData = useCallback(async () => {
    const processed = {}
    for (const g of GAUGES) {
      const readings = await getReadings(g.id, 7)
      if (!readings.length) continue
      const latest = readings[readings.length - 1]
      const rates  = calculateRates(readings, latest)
      const alert  = getAlertLevel(rates)
      processed[g.id] = { height: latest.height, flow: latest.flow, time: latest.time, history: readings, alert, rates }
    }
    if (Object.keys(processed).length > 0 && !usgsResponded.current) {
      setData(processed)
      setIsStale(true)
      setLoading(false)
    }
  }, [])

  // ── Manual refresh ───────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await Promise.all([doFetchData(), doFetchAlerts()])
    } finally {
      setRefreshing(false)
    }
  }, [refreshing, doFetchData, doFetchAlerts])

  // ── Startup + polling ────────────────────────────────────────
  useEffect(() => {
    pruneReadings(30)
    loadCachedData()
    doFetchData()
    doFetchAlerts()

    const dataInterval  = setInterval(doFetchData,   60_000)
    const alertInterval = setInterval(doFetchAlerts, 5 * 60_000)

    // Re-fetch when user returns to the tab (browser throttles timers in background)
    const onVisible = () => {
      if (document.visibilityState === 'visible') doFetchData()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(dataInterval)
      clearInterval(alertInterval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [doFetchData, doFetchAlerts, loadCachedData])

  // ── Formatting ───────────────────────────────────────────────
  const formatCDT = useCallback((dateStr) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      hour12: true, timeZoneName: 'short'
    })
  }, [])

  const alertsArray = Object.values(data).map(d => d.alert)
  const highestAlert = alertsArray.length > 0 ? getHighestAlert(alertsArray) : 'GREEN'

  // Most recent USGS reading time across all gauges
  const newestReading = Object.values(data).reduce((best, d) => {
    if (!d.time) return best
    return !best || d.time > best ? d.time : best
  }, null)

  return (
    <BrowserRouter>
      <div className="dashboard-container">
        <header className="header">
          <div className="header-title">
            <Activity size={32} color="#60a5fa" />
            Guadalupe Sentinel
          </div>
          <div className="header-meta">
            <div className={`alert-badge ${highestAlert}`}>
              <AlertTriangle size={16} />
              {ALERT_LEVELS[highestAlert]?.label || 'Normal'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <div className="header-time">
                <Clock size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                {newestReading ? `Data: ${dataAge(newestReading)}` : 'Loading…'}
              </div>
              <button onClick={handleRefresh} disabled={refreshing} className="refresh-btn" title="Refresh now">
                <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>
        </header>

        {fetchError && (
          <div className="error-banner" role="alert">
            <WifiOff size={16} />
            Unable to reach USGS servers. Displaying last known readings.
          </div>
        )}

        {isStale && !fetchError && (
          <div className="stale-banner" role="status">
            <Database size={14} />
            Showing cached readings — fetching live data…
          </div>
        )}

        <NWSAlertBanner alerts={nwsAlerts} />

        {loading ? (
          <div className="loading-screen">
            <div className="loading-spinner" aria-label="Loading gauge data" />
            <p>Connecting to USGS gauges…</p>
          </div>
        ) : (
          <Routes>
            <Route path="/" element={
              <Dashboard
                data={data}
                formatCDT={formatCDT}
                dataAge={dataAge}
                highestAlert={highestAlert}
                onRefresh={handleRefresh}
                refreshing={refreshing}
              />
            } />
            <Route path="/gauge/:id" element={
              <GaugeDetail
                data={data}
                formatCDT={formatCDT}
                dataAge={dataAge}
                nwsAlerts={nwsAlerts}
                onRefresh={handleRefresh}
                refreshing={refreshing}
              />
            } />
          </Routes>
        )}
      </div>
    </BrowserRouter>
  )
}
