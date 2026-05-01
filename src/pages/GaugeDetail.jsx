import React, { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { GAUGES } from '../config/gauges'
import { fetchPrecipitationForecast } from '../lib/weatherApi'
import { getReadings } from '../lib/database'
import { ALERT_LEVELS } from '../lib/alertEngine'
import { detectSurges, getDownstreamRisk } from '../lib/surgeEngine'
import { projectTrend, rainAdjustPredictions } from '../lib/predictionEngine'
import RiverChart, { buildChartData } from '../components/RiverChart'
import NWSAlertBanner from '../components/NWSAlertBanner'
import {
  ArrowLeft, AlertTriangle, Activity, Cpu, ArrowDown, ArrowUp,
  RefreshCw, BarChart2, CloudRain, TrendingUp, TrendingDown, Minus
} from 'lucide-react'

function fmtHour(isoStr) {
  return new Date(isoStr).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short', hour: 'numeric', hour12: true
  })
}

export default function GaugeDetail({ data, formatCDT, nwsAlerts = [], onRefresh, refreshing = false }) {
  const { id } = useParams()
  const gaugeConfig = GAUGES.find(g => g.id === id)
  const d = data[id]

  const [forecast, setForecast] = useState(null)
  const [loadingForecast, setLoadingForecast] = useState(true)
  const [forecastError, setForecastError] = useState(false)
  const [dbHistory, setDbHistory] = useState([])

  useEffect(() => {
    if (!id) return
    getReadings(id, 7).then(rows => setDbHistory(rows))
  }, [id, d?.time])

  useEffect(() => {
    if (!gaugeConfig) return
    setLoadingForecast(true)
    setForecastError(false)
    fetchPrecipitationForecast(gaugeConfig.lat, gaugeConfig.lng).then(res => {
      if (res === null) setForecastError(true)
      else setForecast(res)
      setLoadingForecast(false)
    })
  }, [gaugeConfig?.id])

  const mergedHistory = useMemo(() => {
    const map = new Map()
    for (const r of dbHistory) map.set(r.time, r)
    for (const r of (d?.history || [])) map.set(r.time, { ...r, gaugeId: id })
    return Array.from(map.values()).sort((a, b) => (a.time < b.time ? -1 : 1))
  }, [dbHistory, d?.time])

  const predictions = useMemo(() => {
    if (!mergedHistory.length) return []
    const base = projectTrend(mergedHistory, 6)
    return forecast ? rainAdjustPredictions(base, forecast) : base
  }, [mergedHistory, forecast])

  const chartData = useMemo(
    () => buildChartData(mergedHistory, predictions, forecast?.hourly || []),
    [mergedHistory, predictions, forecast]
  )

  // 7-day stats from DB history
  const stats7d = useMemo(() => {
    if (dbHistory.length < 2) return null
    const levels = dbHistory.map(r => r.height).filter(h => h != null)
    const flows  = dbHistory.map(r => r.flow).filter(f => f != null)
    if (!levels.length) return null
    const peakReading = dbHistory.reduce((b, r) => (r.height ?? -Infinity) > (b?.height ?? -Infinity) ? r : b, null)
    return {
      maxLevel: Math.max(...levels),
      minLevel: Math.min(...levels),
      avgLevel: levels.reduce((a, b) => a + b, 0) / levels.length,
      maxFlow:  flows.length ? Math.max(...flows)  : null,
      avgFlow:  flows.length ? flows.reduce((a, b) => a + b, 0) / flows.length : null,
      peakTime: peakReading?.time,
      days: Math.round((Date.now() - new Date(dbHistory[0].time).getTime()) / 86400000)
    }
  }, [dbHistory])

  // 24h high / low from mergedHistory
  const stats24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000
    const recent = mergedHistory.filter(r => new Date(r.time).getTime() >= cutoff)
    if (!recent.length) return null
    const levels = recent.map(r => r.height).filter(h => h != null)
    return levels.length ? { high: Math.max(...levels), low: Math.min(...levels) } : null
  }, [mergedHistory])

  // Next 12h hourly precipitation forecast
  const precipForecast12h = useMemo(() => {
    if (!forecast?.hourly) return []
    return forecast.hourly
      .filter(h => h.isForecast)
      .slice(0, 12)
  }, [forecast])

  if (!gaugeConfig || !d) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', marginTop: 40 }}>
        <h2 style={{ marginBottom: 16 }}>Loading Gauge Data…</h2>
        <Link to="/" style={{ color: '#60a5fa', textDecoration: 'none' }}>← Return to Dashboard</Link>
      </div>
    )
  }

  const alertClass = d.alert || 'GREEN'
  const alertLabel = ALERT_LEVELS[alertClass]?.label || 'Normal'
  const height = d.height || 0
  const floodStage = gaugeConfig.floodStageFt
  const floodPct = floodStage ? Math.min((height / floodStage) * 100, 100) : null
  const isStale = d.time ? (Date.now() - new Date(d.time).getTime()) > 15 * 60 * 1000 : false

  const rate5  = d.rates?.rise5m  ?? 0
  const rate15 = d.rates?.rise15m ?? 0
  const rate60 = d.rates?.rise60m ?? 0

  const surgeEvents = detectSurges(data)
  const upstreamThreat    = getDownstreamRisk(id, surgeEvents)
  const downstreamWarning = surgeEvents.find(e => e.sourceGaugeId === id)

  const maxVisual     = Math.max(floodStage ? floodStage * 1.2 : 20, height * 1.1, 10)
  const fillPercent   = Math.min((height / maxVisual) * 100, 100)
  const floodLinePercent = floodStage ? Math.min((floodStage / maxVisual) * 100, 100) : null

  const predPeak = predictions.length ? Math.max(...predictions.map(p => p.height)) : null
  const predIn6h = predictions.at(-1)?.height ?? null

  const dbDays = dbHistory[0]?.time
    ? Math.round((Date.now() - new Date(dbHistory[0].time).getTime()) / 86400000)
    : 0

  let aiMessage = forecastError ? 'Weather forecast unavailable. Monitor conditions manually.' : 'Analyzing conditions…'
  let aiColor   = '#94a3b8'

  if (!forecastError && forecast !== null && d.rates) {
    const rain = forecast.totalInches || 0
    const rise = rate60
    if (rain > 1 && rise > 1) {
      aiMessage = `CRITICAL: ${rain.toFixed(1)}" forecasted with a ${rise.toFixed(1)} ft/hr rise rate. Severe overbank risk. Evacuate low-water crossings immediately.`
      aiColor = '#ef4444'
    } else if (rain > 0.5 && rise > 0) {
      aiMessage = `WARNING: ${rain.toFixed(1)}" incoming will accelerate the current ${rise.toFixed(2)} ft/hr rise. Expect surge within 2–4 hours.`
      aiColor = '#f97316'
    } else if (rain > 0.5) {
      aiMessage = `WATCH: ${rain.toFixed(1)}" of precipitation forecasted. River is stable but expect delayed rises as runoff accumulates.`
      aiColor = '#f59e0b'
    } else if (rise > 0.5) {
      aiMessage = `WARNING: Rising at ${rise.toFixed(1)} ft/hr with no significant rain — likely upstream release or flash runoff. Monitor closely.`
      aiColor = '#f97316'
    } else {
      aiMessage = `STABLE: ${rain.toFixed(2)}" forecasted with no significant rise trend. No surge risk anticipated in the next 6 hours.`
      aiColor = '#10b981'
    }
  }

  const flow = d.flow || 0
  let flowLabel = 'No Data', flowColor = '#94a3b8', flowDesc = 'Flow rate unavailable.'
  if (d.flow !== undefined) {
    if      (flow > 5000) { flowLabel = 'Severe / Flood'; flowColor = '#ef4444'; flowDesc = 'Life-threatening currents. Avoid all water contact.' }
    else if (flow > 2000) { flowLabel = 'Dangerous';      flowColor = '#f97316'; flowDesc = 'Very swift currents with debris. Stay away from the main channel.' }
    else if (flow > 500)  { flowLabel = 'Fast';           flowColor = '#f59e0b'; flowDesc = 'Swift currents. Hazardous for casual swimming and tubing.' }
    else if (flow > 100)  { flowLabel = 'Normal';         flowColor = '#10b981'; flowDesc = 'Typical recreational conditions at a manageable pace.' }
    else                  { flowLabel = 'Low';            flowColor = '#60a5fa'; flowDesc = 'Slow-moving water. Generally safe for casual recreation.' }
  }

  const rateColor = r => r > 0.15 ? 'var(--alert-orange)' : r < -0.08 ? 'var(--alert-green)' : '#94a3b8'
  const TrendIcon = rate60 > 0.1 ? TrendingUp : rate60 < -0.08 ? TrendingDown : Minus
  const trendColor = rate60 > 0.1 ? 'var(--alert-orange)' : rate60 < -0.08 ? 'var(--alert-green)' : '#64748b'

  return (
    <div className="gauge-detail-container">
      <div className="detail-nav">
        <Link to="/" className="back-link">
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="refresh-btn"
          title="Refresh all gauges now"
        >
          <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh Now'}
        </button>
      </div>

      <NWSAlertBanner alerts={nwsAlerts} />

      {/* ── Header panel ── */}
      <div className="glass-panel" style={{ marginBottom: 24 }}>
        {isStale && <div className="stale-banner" style={{ marginBottom: 16 }}>Data may be stale — last reading was over 15 minutes ago.</div>}

        <div className="detail-header-row">
          <div>
            <h1 className="detail-title">{gaugeConfig.name}</h1>
            <div className={`alert-badge ${alertClass}`} style={{ marginBottom: 10 }}>
              <AlertTriangle size={14} /> {alertLabel}
            </div>
            <div style={{ color: '#64748b', fontSize: '0.78rem' }}>
              USGS #{gaugeConfig.id} &nbsp;·&nbsp; {gaugeConfig.lat}°N, {Math.abs(gaugeConfig.lng)}°W
            </div>
          </div>

          <div className="detail-metrics-row">
            <div className="metric">
              <div className="metric-label">Current Level</div>
              <div><span className="metric-value">{height.toFixed(2)}</span><span className="metric-unit"> ft</span></div>
            </div>
            {stats24h && (
              <div className="metric">
                <div className="metric-label">24h High / Low</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
                  {stats24h.high.toFixed(2)}' <span style={{ color: '#475569', fontSize: '0.85rem' }}>/</span> {stats24h.low.toFixed(2)}'
                </div>
              </div>
            )}
            <div className="metric">
              <div className="metric-label">Flow Rate</div>
              <div>
                <span className="metric-value">{d.flow != null ? d.flow.toLocaleString() : '—'}</span>
                <span className="metric-unit"> cfs</span>
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">1hr Change</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <TrendIcon size={14} color={trendColor} />
                <span className="metric-value" style={{ color: rateColor(rate60) }}>
                  {rate60 >= 0 ? '+' : ''}{rate60.toFixed(2)}
                </span>
                <span className="metric-unit"> ft/hr</span>
              </div>
            </div>
            {floodStage && (
              <div className="metric">
                <div className="metric-label">To Flood</div>
                <div>
                  <span
                    className="metric-value"
                    style={{ color: floodPct > 85 ? 'var(--alert-red)' : floodPct > 65 ? 'var(--alert-orange)' : 'var(--text-main)' }}
                  >
                    {Math.max(0, floodStage - height).toFixed(2)}
                  </span>
                  <span className="metric-unit"> ft</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rate-bar">
          {[['5 min', rate5], ['15 min', rate15], ['60 min', rate60]].map(([label, r]) => (
            <div key={label} className="rate-chip">
              <span className="rate-chip-label">{label}</span>
              <span style={{ fontWeight: 700, color: rateColor(r) }}>
                {r >= 0 ? '+' : ''}{r.toFixed(2)} ft
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Interactive Chart ── */}
      <div className="glass-panel" style={{ marginBottom: 24 }}>
        <div className="chart-header">
          <div>
            <h3 style={{ margin: '0 0 4px', color: '#f8fafc', fontSize: '1rem' }}>
              River Level, Flow &amp; Rainfall
            </h3>
            <div style={{ fontSize: '0.72rem', color: '#475569' }}>
              {dbDays > 0
                ? `${dbDays}d stored history + 6hr projection · drag the brush to zoom`
                : '48h USGS history + 6hr projection · drag the brush to zoom'}
            </div>
          </div>
          {predPeak !== null && (
            <div className="chart-summary">
              <span>
                Projected peak:&nbsp;
                <strong style={{ color: floodStage && predPeak > floodStage ? '#ef4444' : '#f8fafc' }}>
                  {predPeak.toFixed(2)}'
                </strong>
              </span>
              <span>In 6hr: <strong style={{ color: '#f8fafc' }}>{predIn6h?.toFixed(2)}'</strong></span>
            </div>
          )}
        </div>

        <RiverChart chartData={chartData} floodStageFt={floodStage} alertClass={alertClass} />

        <div className="chart-legend">
          <span style={{ color: '#94a3b8' }}>━ Historical level</span>
          <span style={{ color: '#94a3b8' }}>╌ 6hr projection {forecast && !forecastError ? '(rain-adjusted)' : '(trend only)'}</span>
          <span style={{ color: '#60a5fa' }}>━ Flow rate</span>
          <span style={{ color: 'rgba(96,165,250,0.7)' }}>▐ Rainfall</span>
          {floodStage && <span style={{ color: '#ef4444' }}>- - Flood stage ({floodStage}')</span>}
        </div>
      </div>

      {/* ── Surge banners ── */}
      {upstreamThreat && (
        <div className="surge-banner surge-banner--red" style={{ marginBottom: 24 }}>
          <ArrowUp size={18} color="#f87171" style={{ flexShrink: 0 }} />
          <div>
            <div className="surge-banner-title">Upstream Surge Incoming</div>
            <div className="surge-banner-body">{upstreamThreat.message}</div>
            <Link to={`/gauge/${upstreamThreat.sourceGaugeId}`} className="surge-link">← View {upstreamThreat.sourceName}</Link>
          </div>
        </div>
      )}
      {downstreamWarning && (
        <div className="surge-banner surge-banner--orange" style={{ marginBottom: 24 }}>
          <ArrowDown size={18} color="#fb923c" style={{ flexShrink: 0 }} />
          <div>
            <div className="surge-banner-title">Downstream Surge Warning Issued</div>
            <div className="surge-banner-body">{downstreamWarning.message}</div>
            <Link to={`/gauge/${downstreamWarning.downstreamGaugeId}`} className="surge-link">Monitor {downstreamWarning.downstreamName} →</Link>
          </div>
        </div>
      )}

      {/* ── Analysis grid ── */}
      <div className="gauge-detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* AI Predictor */}
          <div className="glass-panel" style={{ borderLeft: `4px solid ${aiColor}` }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: '#f8fafc', fontSize: '1rem' }}>
              <Cpu size={18} color={aiColor} />
              Surge Predictor — Next 6h
            </h3>
            {loadingForecast ? (
              <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Gathering meteorological data…</div>
            ) : (
              <>
                <p style={{ fontSize: '0.95rem', lineHeight: 1.65, color: '#e2e8f0', marginBottom: forecastError ? 0 : 20 }}>
                  {aiMessage}
                </p>
                {!forecastError && forecast && (
                  <div className="ai-stats-row">
                    <div className="ai-stat">
                      <div className="ai-stat-label">24h Rain</div>
                      <div className="ai-stat-value">{forecast.totalInches.toFixed(2)}"</div>
                    </div>
                    <div className="ai-stat">
                      <div className="ai-stat-label">Max Intensity</div>
                      <div className="ai-stat-value">{forecast.maxHourlyInches.toFixed(2)}" /hr</div>
                    </div>
                    <div className="ai-stat">
                      <div className="ai-stat-label">60-min Rise</div>
                      <div className="ai-stat-value">{rate60 >= 0 ? '+' : ''}{rate60.toFixed(2)} ft</div>
                    </div>
                    <div className="ai-stat">
                      <div className="ai-stat-label">Proj. Peak</div>
                      <div
                        className="ai-stat-value"
                        style={{ color: predPeak && floodStage && predPeak > floodStage ? '#ef4444' : '#f8fafc' }}
                      >
                        {predPeak != null ? predPeak.toFixed(2) + "'" : '—'}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Hourly precipitation forecast table */}
          {precipForecast12h.length > 0 && (
            <div className="glass-panel">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, color: '#f8fafc', fontSize: '1rem' }}>
                <CloudRain size={18} color="#60a5fa" />
                Hourly Precipitation Forecast
              </h3>
              <div className="precip-table">
                <div className="precip-table-head">
                  <span>Hour</span>
                  <span>Inches</span>
                  <span style={{ textAlign: 'right' }}>Bar</span>
                </div>
                {precipForecast12h.map((h, i) => {
                  const maxIn = Math.max(...precipForecast12h.map(x => x.inches), 0.01)
                  const pct   = (h.inches / maxIn) * 100
                  const color = h.inches > 0.3 ? '#ef4444' : h.inches > 0.1 ? '#f59e0b' : '#60a5fa'
                  return (
                    <div key={i} className="precip-table-row">
                      <span style={{ color: '#94a3b8' }}>{fmtHour(h.time)}</span>
                      <span style={{ color: h.inches > 0 ? color : '#334155', fontWeight: 600 }}>
                        {h.inches > 0 ? h.inches.toFixed(2) + '"' : '—'}
                      </span>
                      <div className="precip-bar-cell">
                        {h.inches > 0 && (
                          <div className="precip-bar-fill" style={{ width: `${pct}%`, background: color }} />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Flow Assessment */}
          <div className="glass-panel" style={{ borderLeft: `4px solid ${flowColor}` }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#f8fafc', fontSize: '1rem' }}>
              <Activity size={18} color={flowColor} />
              Flow Assessment
            </h3>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: flowColor, marginBottom: 4 }}>{flowLabel}</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 10 }}>{flow.toLocaleString()} cfs</div>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: '#e2e8f0' }}>{flowDesc}</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Flood Stage Meter */}
          <div className="glass-panel flood-meter-panel">
            <h3 style={{ textAlign: 'center', color: '#f8fafc', margin: '0 0 20px', fontSize: '1rem' }}>
              Flood Stage Monitor
            </h3>

            <div className="thermometer-wrap">
              <div className="thermometer">
                <div
                  className="thermometer-fill"
                  style={{
                    height: `${fillPercent}%`,
                    background: `var(--alert-${alertClass.toLowerCase()})`,
                    boxShadow: `0 0 28px var(--alert-${alertClass.toLowerCase()})`
                  }}
                />
                {floodLinePercent !== null && (
                  <div className="flood-marker" style={{ bottom: `${floodLinePercent}%` }}>
                    <div className="flood-marker-label">FLOOD</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <div style={{ fontSize: '2.4rem', fontWeight: 800, color: `var(--alert-${alertClass.toLowerCase()})`, lineHeight: 1 }}>
                {height.toFixed(1)}'
              </div>
              {floodStage ? (
                <>
                  <div style={{ color: '#64748b', fontSize: '0.8rem', margin: '6px 0 10px' }}>
                    Flood Stage: {floodStage}'
                  </div>
                  <div className="progress-bar-track" style={{ width: 150, margin: '0 auto 6px' }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.min(floodPct, 100)}%`,
                        background: floodPct > 90 ? 'var(--alert-red)' : floodPct > 65 ? 'var(--alert-orange)' : 'var(--alert-green)'
                      }}
                    />
                  </div>
                  <div style={{ fontSize: '0.78rem', color: floodPct > 80 ? '#fca5a5' : '#64748b', marginBottom: 10 }}>
                    {floodPct.toFixed(0)}% of flood stage
                  </div>
                  <div className="flood-countdown">
                    {Math.max(0, floodStage - height).toFixed(2)} ft until flood
                  </div>
                </>
              ) : (
                <div style={{ color: '#475569', fontSize: '0.8rem', marginTop: 8 }}>Flood stage not defined</div>
              )}
            </div>

            <div className="rate-summary">
              <div className="rate-summary-title">Rise Rates</div>
              {[['5 min', rate5], ['15 min', rate15], ['60 min', rate60]].map(([label, r]) => (
                <div key={label} className="rate-summary-row">
                  <span style={{ color: '#64748b', fontSize: '0.78rem' }}>{label}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.78rem', color: rateColor(r) }}>
                    {r >= 0 ? '+' : ''}{r.toFixed(2)} ft
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 7-day historical statistics */}
          {stats7d && (
            <div className="glass-panel">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: '#f8fafc', fontSize: '1rem' }}>
                <BarChart2 size={18} color="#a78bfa" />
                {stats7d.days}-Day Statistics
              </h3>
              <div className="stats-grid">
                <div className="stats-cell">
                  <div className="stats-label">Peak Level</div>
                  <div className="stats-value" style={{ color: '#ef4444' }}>{stats7d.maxLevel.toFixed(2)}'</div>
                  <div className="stats-sub">{stats7d.peakTime ? formatCDT(stats7d.peakTime) : '—'}</div>
                </div>
                <div className="stats-cell">
                  <div className="stats-label">Low Level</div>
                  <div className="stats-value" style={{ color: '#10b981' }}>{stats7d.minLevel.toFixed(2)}'</div>
                </div>
                <div className="stats-cell">
                  <div className="stats-label">Avg Level</div>
                  <div className="stats-value">{stats7d.avgLevel.toFixed(2)}'</div>
                </div>
                {stats7d.maxFlow != null && (
                  <div className="stats-cell">
                    <div className="stats-label">Peak Flow</div>
                    <div className="stats-value" style={{ color: '#f97316' }}>{stats7d.maxFlow.toLocaleString()} cfs</div>
                  </div>
                )}
                {stats7d.avgFlow != null && (
                  <div className="stats-cell">
                    <div className="stats-label">Avg Flow</div>
                    <div className="stats-value">{Math.round(stats7d.avgFlow).toLocaleString()} cfs</div>
                  </div>
                )}
                <div className="stats-cell">
                  <div className="stats-label">Data Points</div>
                  <div className="stats-value">{dbHistory.length.toLocaleString()}</div>
                  <div className="stats-sub">stored readings</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 20, textAlign: 'center', fontSize: '0.72rem', color: '#334155' }}>
        Last reading: {formatCDT(d.time)} · Auto-refreshes every 60s ·
        {dbDays > 0 ? ` ${dbDays}d of local history` : ' Building local history…'}
      </div>
    </div>
  )
}
