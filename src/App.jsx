import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { GAUGES } from './config/gauges'
import { fetchUSGSGauges } from './lib/usgs'
import { calculateRates, getAlertLevel, getHighestAlert, ALERT_LEVELS } from './lib/alertEngine'
import { Activity, AlertTriangle, Clock } from 'lucide-react'

import Dashboard from './pages/Dashboard'
import GaugeDetail from './pages/GaugeDetail'

export default function App() {
  const [data, setData] = useState({})
  const [lastUpdate, setLastUpdate] = useState(null)

  useEffect(() => {
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

        processed[g.id] = {
          ...d,
          alert,
          rates
        }
      }

      setData(processed)
      setLastUpdate(new Date())
    } catch (err) {
      console.error("Failed to fetch data:", err)
    }
  }

  const formatCDT = (dateStr) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
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
              Dashboard Refreshed: {lastUpdate ? formatCDT(lastUpdate) : 'Loading...'}
            </div>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<Dashboard data={data} formatCDT={formatCDT} highestAlert={highestAlert} lastUpdate={lastUpdate} />} />
          <Route path="/gauge/:id" element={<GaugeDetail data={data} formatCDT={formatCDT} />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
