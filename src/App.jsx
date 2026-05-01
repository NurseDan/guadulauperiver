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

export default function App() {
  const [data, setData] = useState({})
  const [lastUpdate, setLastUpdate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [isStale, setIsStale] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [nwsAlerts, setNwsAlerts] = useState([])
  const usgsResponded = useRef(false)

  useEffect(() => {
    pruneReadings(30)
    loadCachedData()
    fetchData()
    fetchNWSAlerts().then(setNwsAlerts)
    const i = setInterval(fetchData, 60000)
    const j = setInterval(() => fetchNWSAlerts().then(setNwsAlerts), 5 * 60000)
    return () => { clearInterval(i); clearInterval(j) }
  }, [])

  async function loadCachedData() {
    const processed = {}
    for (const g of GAUGES) {
      const readings = await getReadings(g.id, 7)
      if (!readings.length) continue
      const latest = readings[readings.length - 1]
      const rates = calculateRates(readings, latest)
      const alert = getAlertLevel(rates)
      processed[g.id] = {
        height: latest.height,
        flow: latest.flow,
        time: latest.time,
        history: readings,
        alert,
        rates
      }
    }
    if (Object.keys(processed).length > 0 && !usgsResponded.current) {
      setData(processed)
      setIsStale(true)
      setLoading(false)
    }
  }

  async function fetchData() {
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
        if (d.time) {
          saveReading(g.id, { height: d.height, flow: d.flow, time: d.time })
        }
      }

      usgsResponded.current = true
      setData(processed)
      setLastUpdate(new Date())
      setIsStale(false)
      setFetchError(false)
    } catch (err) {
      console.error('Failed to fetch data:', err)
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await Promise.all([
        fetchData(),
        fetchNWSAlerts().then(setNwsAlerts)
      ])
    } finally {
      setRefreshing(false)
    }
  }, [refreshing])

  const formatCDT = (dateStr) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      hour12: true, timeZoneName: 'short'
    })
  }

  const alertsArray = Object.values(data).map(d => d.alert)
  const highestAlert = alertsArray.length > 0 ? getHighestAlert(alertsArray) : 'GREEN'

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
              System Status: {ALERT_LEVELS[highestAlert]?.label || 'Normal'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <div className="header-time">
                <Clock size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                {lastUpdate ? formatCDT(lastUpdate) : 'Loading…'}
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="refresh-btn"
                title="Refresh now"
              >
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
            Showing cached readings — live data loading…
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
            <Route
              path="/"
              element={
                <Dashboard
                  data={data}
                  formatCDT={formatCDT}
                  highestAlert={highestAlert}
                  lastUpdate={lastUpdate}
                  onRefresh={handleRefresh}
                  refreshing={refreshing}
                />
              }
            />
            <Route
              path="/gauge/:id"
              element={
                <GaugeDetail
                  data={data}
                  formatCDT={formatCDT}
                  nwsAlerts={nwsAlerts}
                  onRefresh={handleRefresh}
                  refreshing={refreshing}
                />
              }
            />
          </Routes>
        )}
      </div>
    </BrowserRouter>
  )
}
