import React, { useEffect, useState, useRef } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { GAUGES } from './config/gauges'
import { fetchUSGSGauges } from './lib/usgs'
import { calculateRates, getAlertLevel, getHighestAlert, ALERT_LEVELS } from './lib/alertEngine'
import { saveReading, pruneReadings } from './lib/database'
import { Activity, AlertTriangle, Clock, WifiOff } from 'lucide-react'

import Dashboard from './pages/Dashboard'
import GaugeDetail from './pages/GaugeDetail'

export default function App() {
  const [data, setData] = useState({})
  const [lastUpdate, setLastUpdate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const isFirstFetch = useRef(true)

  useEffect(() => {
    // Prune readings older than 30 days once on startup
    pruneReadings(30)
    fetchData()
    const i = setInterval(fetchData, 60000)
    return () => clearInterval(i)
  }, [])

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

        // Persist the current reading to IndexedDB (fire-and-forget)
        if (d.time) {
          saveReading(g.id, { height: d.height, flow: d.flow, time: d.time })
        }
      }

      setData(processed)
      setLastUpdate(new Date())
      setFetchError(false)
    } catch (err) {
      console.error('Failed to fetch data:', err)
      setFetchError(true)
    } finally {
      if (isFirstFetch.current) {
        isFirstFetch.current = false
        setLoading(false)
      }
    }
  }

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
            <div className="header-time" style={{ marginTop: '8px', fontWeight: '500' }}>
              <Clock size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              Refreshed: {lastUpdate ? formatCDT(lastUpdate) : 'Loading…'}
            </div>
          </div>
        </header>

        {fetchError && (
          <div className="error-banner" role="alert">
            <WifiOff size={16} />
            Unable to reach USGS servers. Displaying last known readings.
          </div>
        )}

        {loading ? (
          <div className="loading-screen">
            <div className="loading-spinner" aria-label="Loading gauge data" />
            <p>Connecting to USGS gauges…</p>
          </div>
        ) : (
          <Routes>
            <Route
              path="/"
              element={<Dashboard data={data} formatCDT={formatCDT} highestAlert={highestAlert} lastUpdate={lastUpdate} />}
            />
            <Route
              path="/gauge/:id"
              element={<GaugeDetail data={data} formatCDT={formatCDT} />}
            />
          </Routes>
        )}
      </div>
    </BrowserRouter>
  )
}
