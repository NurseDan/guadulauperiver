import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { GAUGES } from '../config/gauges'
import { fetchPrecipitationForecast } from '../lib/weatherApi'
import { ALERT_LEVELS } from '../lib/alertEngine'
import Sparkline from '../components/Sparkline'
import { ArrowLeft, AlertTriangle, CloudRain, Activity, Cpu } from 'lucide-react'

export default function GaugeDetail({ data, formatCDT }) {
  const { id } = useParams()
  const gaugeConfig = GAUGES.find(g => g.id === id)
  const d = data[id]
  
  const [forecast, setForecast] = useState(null)
  const [loadingForecast, setLoadingForecast] = useState(true)
  const [forecastError, setForecastError] = useState(false)

  useEffect(() => {
    if (!gaugeConfig) return

    async function loadForecast() {
      setLoadingForecast(true)
      setForecastError(false)
      const res = await fetchPrecipitationForecast(gaugeConfig.lat, gaugeConfig.lng)
      if (res === null) {
        setForecastError(true)
      } else {
        setForecast(res)
      }
      setLoadingForecast(false)
    }
    loadForecast()
  }, [gaugeConfig])

  if (!gaugeConfig || !d) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', marginTop: 40 }}>
        <h2>Loading Gauge Data...</h2>
        <Link to="/" style={{ color: '#60a5fa', textDecoration: 'none' }}>&larr; Return to Dashboard</Link>
      </div>
    )
  }

  const alertClass = d.alert || 'GREEN'
  const alertLabel = ALERT_LEVELS[alertClass]?.label || 'Normal'
  const floodStage = gaugeConfig.floodStageFt || 20 // Default visual max if unknown
  
  // Calculate percentage for thermometer
  const height = d.height || 0
  const maxVisual = Math.max(floodStage * 1.2, height * 1.1, 10)
  const fillPercent = Math.min((height / maxVisual) * 100, 100)
  const floodLinePercent = Math.min((floodStage / maxVisual) * 100, 100)

  // Stale data: warn if last reading is more than 15 minutes old
  const isStale = d.time ? (Date.now() - new Date(d.time).getTime()) > 15 * 60 * 1000 : false

  // AI Surge Predictor Logic
  let aiMessage = forecastError
    ? "Weather forecast unavailable. Check local conditions manually."
    : "Analyzing conditions..."
  let aiColor = forecastError ? "#94a3b8" : "#94a3b8"

  if (!forecastError && forecast && d.rates) {
    const riseRate = d.rates.rise60m || 0
    const rain = forecast.totalInches || 0
    
    if (rain > 1 && riseRate > 1) {
      aiMessage = `CRITICAL DANGER: Localized AI modeling projects high likelihood of severe overbanking. Current 1hr rise rate of ${riseRate.toFixed(1)}ft compounded by ${rain.toFixed(1)}" of forecasted upstream precipitation.`
      aiColor = "#ef4444" // red
    } else if (rain > 0.5 && riseRate > 0) {
      aiMessage = `WARNING: Expected surge acceleration. ${rain.toFixed(1)}" of rain is forecasted, which will exacerbate the current rising trend of ${riseRate.toFixed(2)}ft/hr.`
      aiColor = "#f97316" // orange
    } else if (rain > 0.5 && riseRate <= 0) {
      aiMessage = `WATCH: River is currently stable, but ${rain.toFixed(1)}" of precipitation is incoming. Expect delayed swelling and possible moderate rises.`
      aiColor = "#f59e0b" // yellow
    } else if (riseRate > 0.5) {
      aiMessage = `WARNING: Rapid rise of ${riseRate.toFixed(1)}ft/hr detected with no significant incoming rain. Danger is likely from immediate localized runoff or upstream releases.`
      aiColor = "#f97316" // orange
    } else {
      aiMessage = `STABLE: No significant precipitation forecasted (${rain.toFixed(2)}"). River behavior is expected to follow normal discharge curves without sudden surges.`
      aiColor = "#10b981" // green
    }
  }

  const historyHeights = d.history ? d.history.map(h => h.height).filter(h => typeof h === 'number' && !isNaN(h)) : []

  // Flow Rate Assessment Logic
  let flowMessage = "No flow data available."
  let flowColor = "#94a3b8"
  const flow = d.flow || 0
  
  if (d.flow !== undefined) {
    if (flow > 5000) {
      flowMessage = "Severe / Flood Flow: Extremely dangerous, life-threatening currents. Avoid all water activities."
      flowColor = "#ef4444"
    } else if (flow > 2000) {
      flowMessage = "Dangerous Flow: Very swift, powerful currents. High risk of debris. Stay out of the main channel."
      flowColor = "#f97316"
    } else if (flow > 500) {
      flowMessage = "Fast Flow: Swift currents. Hazardous for inexperienced swimmers or casual tubing."
      flowColor = "#f59e0b"
    } else if (flow > 100) {
      flowMessage = "Normal Flow: Typical recreational conditions. Moving at a steady, manageable pace."
      flowColor = "#10b981"
    } else {
      flowMessage = "Low Flow: Water is moving very slowly. Generally safe for casual recreation."
      flowColor = "#60a5fa"
    }
  }

  return (
    <div className="gauge-detail-container">
      <Link to="/" style={{ color: '#60a5fa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>
      
      <div className="glass-panel" style={{ marginBottom: 24 }}>
        {isStale && (
          <div className="stale-banner" role="status">
            Data may be stale — last reading was over 15 minutes ago.
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
          <div>
            <h1 style={{ fontSize: '2rem', marginBottom: 8 }}>{gaugeConfig.name}</h1>
            <div className={`alert-badge ${alertClass}`} style={{ marginBottom: 16 }}>
              <AlertTriangle size={16} /> {alertLabel}
            </div>
            <div style={{ color: '#94a3b8' }}>
              Lat: {gaugeConfig.lat} | Lng: {gaugeConfig.lng}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 32 }}>
            <div className="metric">
              <div className="metric-label">Current Level</div>
              <div><span className="metric-value">{height.toFixed(2)}</span><span className="metric-unit"> ft</span></div>
            </div>
            <div className="metric">
              <div className="metric-label">Flow Rate</div>
              <div><span className="metric-value">{d.flow ? d.flow.toLocaleString() : '—'}</span><span className="metric-unit"> cfs</span></div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="gauge-detail-grid">
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* AI Predictor Panel */}
          <div className="glass-panel" style={{ flex: 1, borderLeft: `4px solid ${aiColor}` }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: '#f8fafc' }}>
              <Cpu size={20} color={aiColor} />
              AI Surge Predictor (Next 24h)
            </h3>
            
            {loadingForecast ? (
              <div style={{ color: '#94a3b8' }}>Gathering meteorological data...</div>
            ) : (
              <>
                <p style={{ fontSize: '1.1rem', lineHeight: 1.6, color: '#e2e8f0', marginBottom: forecastError ? 0 : 24 }}>
                  {aiMessage}
                </p>
                {!forecastError && (
                <div style={{ display: 'flex', gap: 24, background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Forecasted Rain</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{forecast?.totalInches?.toFixed(2) || '0.00'} in</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Max Intensity</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{forecast?.maxHourlyInches?.toFixed(2) || '0.00'} in/hr</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>1hr Rise Rate</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{d.rates?.rise60m?.toFixed(2) || '0.00'} ft</div>
                  </div>
                </div>
                )}
              </>
            )}
          </div>
          <div className="glass-panel" style={{ flex: 1, borderLeft: `4px solid ${flowColor}`, marginTop: 24 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#f8fafc' }}>
              <Activity size={20} color={flowColor} />
              Flow Assessment
            </h3>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: flowColor, marginBottom: 8 }}>
              {flow.toLocaleString()} cfs
            </div>
            <p style={{ fontSize: '1rem', lineHeight: 1.5, color: '#e2e8f0' }}>
              {flowMessage}
            </p>
          </div>
          
          <div className="glass-panel" style={{ marginTop: 24 }}>
            <h3 style={{ marginBottom: 16, color: '#f8fafc' }}>Past 2 Hours History</h3>
            <Sparkline data={historyHeights} color={`var(--alert-${alertClass.toLowerCase()})`} height={100} width={800} />
            <div style={{ marginTop: 16, textAlign: 'right', fontSize: '0.875rem', color: '#94a3b8' }}>
              Last Reading: {formatCDT(d.time)}
            </div>
          </div>
        </div>

        {/* Illuminated Flood Stage Meter */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h3 style={{ marginBottom: 24, textAlign: 'center' }}>Flood Stage Monitor</h3>
          
          <div style={{ position: 'relative', height: 300, width: 60, background: 'rgba(0,0,0,0.3)', borderRadius: 30, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            {/* Water Fill */}
            <div style={{ 
              position: 'absolute', 
              bottom: 0, 
              left: 0, 
              width: '100%', 
              height: `${fillPercent}%`, 
              background: `var(--alert-${alertClass.toLowerCase()})`,
              transition: 'height 1s ease-in-out, background 0.5s',
              boxShadow: `0 0 20px var(--alert-${alertClass.toLowerCase()})`
            }}></div>
            
            {/* Flood Stage Line */}
            {gaugeConfig.floodStageFt && (
              <div style={{
                position: 'absolute',
                bottom: `${floodLinePercent}%`,
                left: -10,
                width: 80,
                borderBottom: '2px dashed #ef4444',
                zIndex: 10
              }}>
                <div style={{ position: 'absolute', right: -50, top: -8, color: '#ef4444', fontSize: '0.75rem', fontWeight: 'bold' }}>FLOOD</div>
              </div>
            )}
          </div>
          
          {gaugeConfig.floodStageFt && (
            <div style={{ marginTop: 12, padding: '8px 16px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, color: '#fca5a5', fontSize: '0.875rem', fontWeight: 600 }}>
              {Math.max(0, gaugeConfig.floodStageFt - height).toFixed(2)} ft until Flood Stage
            </div>
          )}

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: `var(--alert-${alertClass.toLowerCase()})` }}>
              {height.toFixed(1)}'
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
              {gaugeConfig.floodStageFt ? `Flood Stage: ${gaugeConfig.floodStageFt}'` : 'Flood Stage Unknown'}
            </div>
          </div>
        </div>
        
      </div>
    </div>
  )
}
