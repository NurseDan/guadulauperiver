import React, { useEffect, useState, useMemo, useCallback } from 'react'
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
  RefreshCw, BarChart2, CloudRain, TrendingUp, TrendingDown, Minus, Clock
} from 'lucide-react'

function fmtHour(isoStr) {
  return new Date(isoStr).toLocaleString('en-US', {
    timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hour12: true
  })
}

function rateColor(r) {
  if (r > 0.5)  return 'var(--alert-orange)'
  if (r > 0.15) return 'var(--alert-yellow)'
  if (r < -0.3) return 'var(--alert-green)'
  return '#94a3b8'
}

export default function GaugeDetail({ data, formatCDT, dataAge, nwsAlerts = [], onRefresh, refreshing = false }) {
  const { id } = useParams()
  const gaugeConfig = GAUGES.find(g => g.id === id)
  const d = data[id]

  const [forecast, setForecast] = useState(null)
  const [loadingForecast, setLoadingForecast] = useState(true)
  const [forecastError, setForecastError] = useState(false)
  const [dbHistory, setDbHistory] = useState([])

  // Reload DB history whenever the gauge or the live USGS timestamp changes
  useEffect(() => {
    if (!id) return
    getReadings(id, 7).then(rows => setDbHistory(rows))
  }, [id, d?.time])

  // Fetch weather forecast when gauge location changes
  useEffect(() => {
    if (!gaugeConfig?.lat) return
    setLoadingForecast(true)
    setForecastError(false)
    fetchPrecipitationForecast(gaugeConfig.lat, gaugeConfig.lng).then(res => {
      setForecast(res)
      if (res === null) setForecastError(true)
      setLoadingForecast(false)
    })
  }, [gaugeConfig?.lat, gaugeConfig?.lng])

  // Merge DB history + live USGS 48h window, deduplicated by timestamp
  const mergedHistory = useMemo(() => {
    const map = new Map()
    for (const r of dbHistory) map.set(r.time, r)
    for (const r of (d?.history || [])) map.set(r.time, { ...r, gaugeId: id })
    return Array.from(map.values()).sort((a, b) => (a.time < b.time ? -1 : 1))
  }, [dbHistory, d?.history, id])

  const predictions = useMemo(() => {
    if (!mergedHistory.length) return []
    const base = projectTrend(mergedHistory, 6)
    return forecast ? rainAdjustPredictions(base, forecast) : base
  }, [mergedHistory, forecast])

  const chartData = useMemo(
    () => buildChartData(mergedHistory, predictions, forecast?.hourly || []),
    [mergedHistory, predictions, forecast]
  )

  // 24h high / low
  const stats24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000
    const recent = mergedHistory.filter(r => new Date(r.time).getTime() >= cutoff)
    const levels = recent.map(r => r.height).filter(h => h != null)
    const flows  = recent.map(r => r.flow).filter(f => f != null)
    if (!levels.length) return null
    return {
      highLevel: Math.max(...levels),
      lowLevel:  Math.min(...levels),
      highFlow:  flows.length ? Math.max(...flows) : null,
    }
  }, [mergedHistory])

  // 7-day statistics from IndexedDB
  const stats7d = useMemo(() => {
    if (dbHistory.length < 4) return null
    const levels = dbHistory.map(r => r.height).filter(h => h != null)
    const flows  = dbHistory.map(r => r.flow).filter(f => f != null)
    if (!levels.length) return null
    const peakReading = dbHistory.reduce((b, r) => (r.height ?? -Infinity) > (b?.height ?? -Infinity) ? r : b, null)
    return {
      maxLevel: Math.max(...levels),
      minLevel: Math.min(...levels),
      avgLevel: levels.reduce((a, b) => a + b, 0) / levels.length,
      maxFlow:  flows.length ? Math.max(...flows) : null,
      avgFlow:  flows.length ? Math.round(flows.reduce((a, b) => a + b, 0) / flows.length) : null,
      peakTime: peakReading?.time,
      days:     Math.ceil((Date.now() - new Date(dbHistory[0].time).getTime()) / 86400000),
      count:    dbHistory.length,
    }
  }, [dbHistory])

  // Next 12h hourly precip forecast
  const precipForecast12h = useMemo(() => {
    if (!forecast?.hourly) return []
    return forecast.hourly.filter(h => h.isForecast).slice(0, 12)
  }, [forecast])

  if (!gaugeConfig) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', marginTop: 40 }}>
        <h2 style={{ marginBottom: 16 }}>Unknown gauge ID</h2>
        <Link to="/" style={{ color: '#60a5fa', textDecoration: 'none' }}>← Back to Dashboard</Link>
      </div>
    )
  }

  if (!d) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', marginTop: 40 }}>
        <div className="loading-spinner" aria-label="loading" style={{ margin: '0 auto 16px' }} />
        <p style={{ color: '#94a3b8', marginBottom: 16 }}>Waiting for gauge data…</p>
        <Link to="/" style={{ color: '#60a5fa', textDecoration: 'none' }}>← Back to Dashboard</Link>
      </div>
    )
  }

  const alertClass = d.alert || 'GREEN'
  const alertLabel = ALERT_LEVELS[alertClass]?.label || 'Normal'
  const height     = d.height || 0
  const floodStage = gaugeConfig.floodStageFt
  const floodPct   = floodStage ? Math.min((height / floodStage) * 100, 100) : null
  const ageStr     = dataAge ? dataAge(d.time) : ''
  const isDataStale = d.time ? (Date.now() - new Date(d.time).getTime()) > 20 * 60 * 1000 : false

  const rise15m = d.rates?.rise15m ?? 0
  const rate1h  = d.rates?.rate1h  ?? 0
  const rate3h  = d.rates?.rate3h  ?? 0

  const surgeEvents      = detectSurges(data)
  const upstreamThreat   = getDownstreamRisk(id, surgeEvents)
  const downstreamWarning = surgeEvents.find(e => e.sourceGaugeId === id)

  const maxVisual      = Math.max(floodStage ? floodStage * 1.2 : 20, height * 1.1, 10)
  const fillPercent    = Math.min((height / maxVisual) * 100, 100)
  const floodLinePercent = floodStage ? Math.min((floodStage / maxVisual) * 100, 100) : null

  const predPeak = predictions.length ? Math.max(...predictions.map(p => p.height)) : null
  const predIn6h = predictions.at(-1)?.height ?? null

  const dbDays = dbHistory[0]?.time
    ? Math.ceil((Date.now() - new Date(dbHistory[0].time).getTime()) / 86400000)
    : 0

  // AI assessment
  let aiMessage = forecastError ? 'Weather forecast unavailable — monitor conditions manually.' : 'Analyzing…'
  let aiColor   = '#94a3b8'
  if (!forecastError && forecast && d.rates) {
    const rain = forecast.totalInches || 0
    const rise = rate1h
    if (rain > 1 && rise > 1) {
      aiMessage = `CRITICAL: ${rain.toFixed(1)}" forecasted rain combined with a ${rise.toFixed(1)} ft/hr rise rate. Severe overbank flooding likely. Evacuate low-water crossings immediately.`
      aiColor = '#ef4444'
    } else if (rain > 0.5 && rise > 0) {
      aiMessage = `WARNING: ${rain.toFixed(1)}" incoming will accelerate the current ${rise.toFixed(2)} ft/hr rise. Expect surge arrival within 2–4 hours.`
      aiColor = '#f97316'
    } else if (rain > 0.5) {
      aiMessage = `WATCH: ${rain.toFixed(1)}" of precipitation forecasted. River is currently stable but expect delayed rises as upstream runoff accumulates.`
      aiColor = '#f59e0b'
    } else if (rise > 0.5) {
      aiMessage = `WARNING: Rising at ${rise.toFixed(1)} ft/hr with no significant rain — likely upstream release or delayed flash runoff. Monitor closely.`
      aiColor = '#f97316'
    } else {
      aiMessage = `STABLE: ${rain.toFixed(2)}" forecasted with no significant rise trend. No surge risk anticipated in the next 6 hours.`
      aiColor = '#10b981'
    }
  }

  // Flow assessment
  const flow = d.flow ?? 0
  let flowLabel = '—', flowColor = '#94a3b8', flowDesc = 'Flow rate not available for this gauge.'
  if (d.flow != null) {
    if      (flow > 5000) { flowLabel = 'Flood / Life-threatening'; flowColor = '#ef4444'; flowDesc = 'Extreme currents with debris. All water access is dangerous.' }
    else if (flow > 2000) { flowLabel = 'Dangerous';      flowColor = '#f97316'; flowDesc = 'Very swift currents. Stay completely away from the river.' }
    else if (flow > 500)  { flowLabel = 'Swift / Hazardous'; flowColor = '#f59e0b'; flowDesc = 'Fast currents. Hazardous for swimming and tubing.' }
    else if (flow > 100)  { flowLabel = 'Normal';         flowColor = '#10b981'; flowDesc = 'Typical recreational flow at a manageable pace.' }
    else                  { flowLabel = 'Low';            flowColor = '#60a5fa'; flowDesc = 'Slow, shallow conditions. Safe for most recreation.' }
  }

  const TrendIcon = rate1h > 0.3 ? TrendingUp : rate1h < -0.3 ? TrendingDown : Minus
  const trendColor = rate1h > 0.3 ? 'var(--alert-orange)' : rate1h < -0.3 ? 'var(--alert-green)' : '#64748b'

  return (
    <div className="gauge-detail-container">
      {/* Nav row */}
      <div className="detail-nav">
        <Link to="/" className="back-link"><ArrowLeft size={16} /> Back to Dashboard</Link>
        <button onClick={onRefresh} disabled={refreshing} className="refresh-btn" title="Refresh all gauges">
          <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh Now'}
        </button>
      </div>

      <NWSAlertBanner alerts={nwsAlerts} />

      {/* ── Header ── */}
      <div className="glass-panel" style={{ marginBottom: 24 }}>
        {isDataStale && (
          <div className="stale-banner" style={{ marginBottom: 16 }}>
            Data is {ageStr} old — USGS may be experiencing delays.
          </div>
        )}

        <div className="detail-header-row">
          <div>
            <h1 className="detail-title">{gaugeConfig.name}</h1>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <div className={`alert-badge ${alertClass}`}>
                <AlertTriangle size={14} /> {alertLabel}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b', fontSize: '0.75rem' }}>
                <Clock size={12} />
                {ageStr || formatCDT(d.time)}
              </div>
            </div>
            <div style={{ color: '#475569', fontSize: '0.75rem' }}>
              USGS #{gaugeConfig.id} · {gaugeConfig.lat}°N, {Math.abs(gaugeConfig.lng)}°W
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
                <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '1.1rem' }}>
                  <span style={{ color: '#ef4444' }}>{stats24h.highLevel.toFixed(2)}'</span>
                  <span style={{ color: '#475569', margin: '0 4px' }}>/</span>
                  <span style={{ color: '#10b981' }}>{stats24h.lowLevel.toFixed(2)}'</span>
                </div>
              </div>
            )}
            <div className="metric">
              <div className="metric-label">Flow Rate</div>
              <div>
                <span className="metric-value" style={{ color: flowColor }}>
                  {d.flow != null ? d.flow.toLocaleString() : '—'}
                </span>
                <span className="metric-unit"> cfs</span>
              </div>
            </div>
            <div className="metric">
              <div className="metric-label">Rise Rate</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <TrendIcon size={14} color={trendColor} />
                <span className="metric-value" style={{ color: rateColor(rate1h) }}>
                  {rate1h >= 0 ? '+' : ''}{rate1h.toFixed(2)}
                </span>
                <span className="metric-unit"> ft/hr</span>
              </div>
            </div>
            {floodStage && (
              <div className="metric">
                <div className="metric-label">To Flood Stage</div>
                <div>
                  <span className="metric-value" style={{ color: floodPct > 85 ? 'var(--alert-red)' : floodPct > 65 ? 'var(--alert-orange)' : 'var(--text-main)' }}>
                    {Math.max(0, floodStage - height).toFixed(2)}
                  </span>
                  <span className="metric-unit"> ft</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Rate chips */}
        <div className="rate-bar">
          <div className="rate-chip">
            <span className="rate-chip-label">15 min</span>
            <span style={{ fontWeight: 700, color: rateColor(rise15m) }}>
              {rise15m >= 0 ? '+' : ''}{rise15m.toFixed(2)} ft
            </span>
          </div>
          <div className="rate-chip">
            <span className="rate-chip-label">1 hr rate</span>
            <span style={{ fontWeight: 700, color: rateColor(rate1h) }}>
              {rate1h >= 0 ? '+' : ''}{rate1h.toFixed(2)} ft/hr
            </span>
          </div>
          <div className="rate-chip">
            <span className="rate-chip-label">3 hr rate</span>
            <span style={{ fontWeight: 700, color: rateColor(rate3h) }}>
              {rate3h >= 0 ? '+' : ''}{rate3h.toFixed(2)} ft/hr
            </span>
          </div>
          {floodStage && floodPct != null && (
            <div className="rate-chip">
              <span className="rate-chip-label">Flood stage</span>
              <span style={{ fontWeight: 700, color: floodPct > 80 ? 'var(--alert-red)' : floodPct > 60 ? 'var(--alert-orange)' : '#64748b' }}>
                {floodPct.toFixed(0)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="glass-panel" style={{ marginBottom: 24 }}>
        <div className="chart-header">
          <div>
            <h3 style={{ margin: '0 0 4px', color: '#f8fafc', fontSize: '1rem' }}>River Level, Flow &amp; Rainfall</h3>
            <div style={{ fontSize: '0.72rem', color: '#475569' }}>
              {dbDays > 0 ? `${dbDays}d stored + live 48h` : '48h USGS window'} + 6h projection · drag brush to zoom
            </div>
          </div>
          {predPeak != null && (
            <div className="chart-summary">
              <span>Projected peak: <strong style={{ color: floodStage && predPeak > floodStage ? '#ef4444' : '#f8fafc' }}>{predPeak.toFixed(2)}'</strong></span>
              <span>In 6h: <strong style={{ color: '#f8fafc' }}>{predIn6h?.toFixed(2)}'</strong></span>
            </div>
          )}
        </div>

        <RiverChart chartData={chartData} floodStageFt={floodStage} alertClass={alertClass} />

        <div className="chart-legend">
          <span style={{ color: '#94a3b8' }}>━ Level (ft)</span>
          <span style={{ color: '#94a3b8' }}>╌ 6h projection {forecast && !forecastError ? '(rain-adjusted)' : '(trend only)'}</span>
          <span style={{ color: '#60a5fa' }}>━ Flow (cfs)</span>
          <span style={{ color: 'rgba(96,165,250,0.65)' }}>▐ Rainfall</span>
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

        {/* LEFT column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Surge predictor */}
          <div className="glass-panel" style={{ borderLeft: `4px solid ${aiColor}` }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, color: '#f8fafc', fontSize: '1rem' }}>
              <Cpu size={18} color={aiColor} /> Surge Predictor — Next 6h
            </h3>
            {loadingForecast ? (
              <div style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Gathering meteorological data…</div>
            ) : (
              <>
                <p style={{ fontSize: '0.9rem', lineHeight: 1.65, color: '#e2e8f0', marginBottom: forecastError ? 0 : 18 }}>
                  {aiMessage}
                </p>
                {!forecastError && forecast && (
                  <div className="ai-stats-row">
                    <div className="ai-stat">
                      <div className="ai-stat-label">24h Precip</div>
                      <div className="ai-stat-value">{forecast.totalInches.toFixed(2)}"</div>
                    </div>
                    <div className="ai-stat">
                      <div className="ai-stat-label">Max Intensity</div>
                      <div className="ai-stat-value">{forecast.maxHourlyInches.toFixed(2)}" /hr</div>
                    </div>
                    <div className="ai-stat">
                      <div className="ai-stat-label">1hr Rise Rate</div>
                      <div className="ai-stat-value" style={{ color: rateColor(rate1h) }}>
                        {rate1h >= 0 ? '+' : ''}{rate1h.toFixed(2)} ft/hr
                      </div>
                    </div>
                    <div className="ai-stat">
                      <div className="ai-stat-label">Projected Peak</div>
                      <div className="ai-stat-value" style={{ color: predPeak && floodStage && predPeak > floodStage ? '#ef4444' : '#f8fafc' }}>
                        {predPeak != null ? predPeak.toFixed(2) + "'" : '—'}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Hourly precip forecast */}
          {precipForecast12h.length > 0 && (
            <div className="glass-panel">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, color: '#f8fafc', fontSize: '1rem' }}>
                <CloudRain size={18} color="#60a5fa" /> 12-Hour Precipitation Forecast
              </h3>
              <div className="precip-table">
                <div className="precip-table-head">
                  <span>Hour (CDT)</span><span>Inches</span><span>Bar</span>
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
                        {h.inches > 0 && <div className="precip-bar-fill" style={{ width: `${pct}%`, background: color }} />}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Flow assessment */}
          <div className="glass-panel" style={{ borderLeft: `4px solid ${flowColor}` }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#f8fafc', fontSize: '1rem' }}>
              <Activity size={18} color={flowColor} /> Flow Assessment
            </h3>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: flowColor, marginBottom: 4 }}>{flowLabel}</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 10 }}>
              {d.flow != null ? `${d.flow.toLocaleString()} cfs current` : '—'}
              {stats24h?.highFlow != null && ` · 24h high: ${stats24h.highFlow.toLocaleString()} cfs`}
            </div>
            <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: '#e2e8f0' }}>{flowDesc}</p>
          </div>
        </div>

        {/* RIGHT column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Flood stage meter */}
          <div className="glass-panel flood-meter-panel">
            <h3 style={{ textAlign: 'center', color: '#f8fafc', margin: '0 0 18px', fontSize: '1rem' }}>
              Flood Stage Monitor
            </h3>
            <div className="thermometer-wrap">
              <div className="thermometer">
                <div className="thermometer-fill" style={{
                  height: `${fillPercent}%`,
                  background: `var(--alert-${alertClass.toLowerCase()})`,
                  boxShadow: `0 0 28px var(--alert-${alertClass.toLowerCase()})`
                }} />
                {floodLinePercent != null && (
                  <div className="flood-marker" style={{ bottom: `${floodLinePercent}%` }}>
                    <div className="flood-marker-label">FLOOD</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <div style={{ fontSize: '2.4rem', fontWeight: 800, color: `var(--alert-${alertClass.toLowerCase()})`, lineHeight: 1 }}>
                {height.toFixed(1)}'
              </div>
              {floodStage ? (
                <>
                  <div style={{ color: '#64748b', fontSize: '0.78rem', margin: '6px 0 10px' }}>
                    Flood Stage: {floodStage}'
                  </div>
                  <div className="progress-bar-track" style={{ width: 150, margin: '0 auto 6px' }}>
                    <div className="progress-bar-fill" style={{
                      width: `${Math.min(floodPct, 100)}%`,
                      background: floodPct > 90 ? 'var(--alert-red)' : floodPct > 65 ? 'var(--alert-orange)' : 'var(--alert-green)'
                    }} />
                  </div>
                  <div style={{ fontSize: '0.78rem', color: floodPct > 80 ? '#fca5a5' : '#64748b', marginBottom: 10 }}>
                    {floodPct.toFixed(0)}% of flood stage
                  </div>
                  <div className="flood-countdown">
                    {Math.max(0, floodStage - height).toFixed(2)} ft to flood stage
                  </div>
                </>
              ) : (
                <div style={{ color: '#475569', fontSize: '0.8rem', marginTop: 8 }}>Flood stage not established</div>
              )}
            </div>

            <div className="rate-summary">
              <div className="rate-summary-title">Rise / Fall Rates</div>
              <div className="rate-summary-row">
                <span style={{ color: '#64748b', fontSize: '0.78rem' }}>15 min (abs)</span>
                <span style={{ fontWeight: 700, fontSize: '0.78rem', color: rateColor(rise15m) }}>
                  {rise15m >= 0 ? '+' : ''}{rise15m.toFixed(2)} ft
                </span>
              </div>
              <div className="rate-summary-row">
                <span style={{ color: '#64748b', fontSize: '0.78rem' }}>1 hr rate</span>
                <span style={{ fontWeight: 700, fontSize: '0.78rem', color: rateColor(rate1h) }}>
                  {rate1h >= 0 ? '+' : ''}{rate1h.toFixed(2)} ft/hr
                </span>
              </div>
              <div className="rate-summary-row">
                <span style={{ color: '#64748b', fontSize: '0.78rem' }}>3 hr rate</span>
                <span style={{ fontWeight: 700, fontSize: '0.78rem', color: rateColor(rate3h) }}>
                  {rate3h >= 0 ? '+' : ''}{rate3h.toFixed(2)} ft/hr
                </span>
              </div>
            </div>
          </div>

          {/* 7-day stats */}
          {stats7d && (
            <div className="glass-panel">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: '#f8fafc', fontSize: '1rem' }}>
                <BarChart2 size={18} color="#a78bfa" /> {stats7d.days}-Day Statistics
              </h3>
              <div className="stats-grid">
                <div className="stats-cell">
                  <div className="stats-label">Peak Level</div>
                  <div className="stats-value" style={{ color: '#ef4444' }}>{stats7d.maxLevel.toFixed(2)}'</div>
                  <div className="stats-sub">{stats7d.peakTime ? dataAge(stats7d.peakTime) : '—'}</div>
                </div>
                <div className="stats-cell">
                  <div className="stats-label">Low Level</div>
                  <div className="stats-value" style={{ color: '#10b981' }}>{stats7d.minLevel.toFixed(2)}'</div>
                </div>
                <div className="stats-cell">
                  <div className="stats-label">Average Level</div>
                  <div className="stats-value">{stats7d.avgLevel.toFixed(2)}'</div>
                </div>
                {stats7d.maxFlow != null && (
                  <div className="stats-cell">
                    <div className="stats-label">Peak Flow</div>
                    <div className="stats-value" style={{ color: '#f97316' }}>{stats7d.maxFlow.toLocaleString()}</div>
                    <div className="stats-sub">cfs</div>
                  </div>
                )}
                {stats7d.avgFlow != null && (
                  <div className="stats-cell">
                    <div className="stats-label">Average Flow</div>
                    <div className="stats-value">{stats7d.avgFlow.toLocaleString()}</div>
                    <div className="stats-sub">cfs</div>
                  </div>
                )}
                <div className="stats-cell">
                  <div className="stats-label">Stored Readings</div>
                  <div className="stats-value">{stats7d.count.toLocaleString()}</div>
                  <div className="stats-sub">{stats7d.days}d of history</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 20, textAlign: 'center', fontSize: '0.72rem', color: '#334155' }}>
        USGS #{gaugeConfig.id} · Last reading: {formatCDT(d.time)} ({ageStr}) · Refreshes every 60s
        {dbDays > 0 ? ` · ${dbDays}d stored locally` : ''}
      </div>
    </div>
  )
}
