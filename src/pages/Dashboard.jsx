import React from 'react'
import { Link } from 'react-router-dom'
import { GAUGES } from '../config/gauges'
import { ALERT_LEVELS } from '../lib/alertEngine'
import { alertColor } from '../lib/alertColors'
import RiverMap from '../components/RiverMap'
import Sparkline from '../components/Sparkline'

function flowWidth(cfs) {
  if (!cfs || cfs < 50) return 3
  if (cfs < 300) return 5
  if (cfs < 1000) return 8
  if (cfs < 3000) return 11
  return 14
}

// Horizontal SVG strip showing all gauges in river order with colored flow segments
function RiverCorridor({ gauges }) {
  const sorted = [...GAUGES].sort((a, b) => a.order - b.order)
  const W = 800, H = 100
  const padX = 72
  const step = (W - padX * 2) / (sorted.length - 1)
  const midY = 46

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* Flow segments */}
      {sorted.slice(0, -1).map((g, i) => {
        const x1 = padX + i * step
        const x2 = padX + (i + 1) * step
        const d = gauges[g.id]
        const color = alertColor(d?.alert)
        const w = flowWidth(d?.flow)
        return (
          <g key={g.id}>
            {/* Glow */}
            <line x1={x1} y1={midY} x2={x2} y2={midY} stroke={color} strokeWidth={w + 10} opacity={0.13} strokeLinecap="round" />
            {/* Main segment */}
            <line x1={x1} y1={midY} x2={x2} y2={midY} stroke={color} strokeWidth={w} opacity={0.88} strokeLinecap="round" />
            {/* Flow direction dashes */}
            <line x1={x1} y1={midY} x2={x2} y2={midY} stroke="rgba(255,255,255,0.38)" strokeWidth={1.5} strokeDasharray="5 13" />
          </g>
        )
      })}

      {/* Gauge station nodes */}
      {sorted.map((g, i) => {
        const x = padX + i * step
        const d = gauges[g.id]
        const color = alertColor(d?.alert)
        const ht = d?.height
        const rate = d?.rates?.rise60m ?? 0
        const rateStr = rate > 0.05
          ? `↑ +${rate.toFixed(1)}'`
          : rate < -0.05
            ? `↓ ${rate.toFixed(1)}'`
            : '→ stable'

        return (
          <g key={g.id}>
            {/* Glow ring */}
            <circle cx={x} cy={midY} r={14} fill={color} opacity={0.18} />
            {/* Station circle */}
            <circle cx={x} cy={midY} r={10} fill={color} />
            <circle cx={x} cy={midY} r={10} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />

            {/* Current level */}
            <text x={x} y={midY - 22} fill="#f8fafc" fontSize={12} textAnchor="middle" fontWeight="700" fontFamily="Inter,sans-serif">
              {ht != null ? ht.toFixed(1) + "'" : '—'}
            </text>

            {/* Rise rate */}
            <text x={x} y={midY - 10} fill={color} fontSize={9} textAnchor="middle" fontFamily="Inter,sans-serif">
              {rateStr}
            </text>

            {/* Station name */}
            <text x={x} y={midY + 25} fill="#64748b" fontSize={9} textAnchor="middle" fontFamily="Inter,sans-serif">
              {g.shortName}
            </text>
          </g>
        )
      })}

      {/* Direction labels */}
      <text x={6} y={midY + 4} fill="#334155" fontSize={9} fontFamily="Inter,sans-serif">↑ upstream</text>
      <text x={W - 6} y={midY + 4} fill="#334155" fontSize={9} textAnchor="end" fontFamily="Inter,sans-serif">downstream ↓</text>
    </svg>
  )
}

export default function Dashboard({ data, formatCDT }) {
  return (
    <>
      {/* River Corridor Strip */}
      <div className="glass-panel corridor-panel">
        <div className="section-label">River Corridor — Upstream to Downstream</div>
        <RiverCorridor gauges={data} />
      </div>

      {/* Gauge Cards */}
      <div className="dashboard-grid">
        {GAUGES.map(g => {
          const d = data[g.id]
          const alertClass = d?.alert || 'GREEN'
          const alertLabel = ALERT_LEVELS[alertClass]?.label || 'Normal'
          const rate60 = d?.rates?.rise60m ?? 0
          const floodPct = g.floodStageFt && d?.height != null
            ? Math.min((d.height / g.floodStageFt) * 100, 110)
            : null

          const historyHeights = d?.history
            ? d.history.map(h => h.height).filter(h => typeof h === 'number' && !isNaN(h))
            : []

          const rateColor = rate60 > 0.3
            ? 'var(--alert-orange)'
            : rate60 < -0.1
              ? 'var(--alert-green)'
              : 'var(--text-main)'

          return (
            <Link to={`/gauge/${g.id}`} key={g.id} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div
                className="glass-panel gauge-card"
                style={{ '--card-color': `var(--alert-${alertClass.toLowerCase()})` }}
              >
                <div className="gauge-header">
                  <div className="gauge-name">{g.name}</div>
                  <div className={`alert-badge ${alertClass}`}>{alertLabel}</div>
                </div>

                <div className="gauge-metrics">
                  <div className="metric">
                    <div className="metric-label">Level</div>
                    <div>
                      <span className="metric-value">{d?.height != null ? d.height.toFixed(2) : '—'}</span>
                      <span className="metric-unit"> ft</span>
                    </div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Flow</div>
                    <div>
                      <span className="metric-value">{d?.flow != null ? d.flow.toLocaleString() : '—'}</span>
                      <span className="metric-unit"> cfs</span>
                    </div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">1hr Change</div>
                    <div>
                      <span className="metric-value" style={{ fontSize: '1.5rem', color: rateColor }}>
                        {rate60 >= 0 ? '+' : ''}{rate60.toFixed(2)}
                      </span>
                      <span className="metric-unit"> ft</span>
                    </div>
                  </div>
                </div>

                {/* Flood stage progress bar */}
                {floodPct !== null && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', marginBottom: 4 }}>
                      <span>Flood stage progress</span>
                      <span style={{ color: floodPct > 85 ? 'var(--alert-red)' : floodPct > 65 ? 'var(--alert-orange)' : '#64748b' }}>
                        {floodPct.toFixed(0)}% &nbsp;({g.floodStageFt} ft)
                      </span>
                    </div>
                    <div className="progress-bar-track">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${Math.min(floodPct, 100)}%`,
                          background: floodPct > 90
                            ? 'var(--alert-red)'
                            : floodPct > 65
                              ? 'var(--alert-orange)'
                              : 'var(--alert-green)'
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* 48h sparkline */}
                <div style={{ marginBottom: 12 }}>
                  <div className="metric-label" style={{ marginBottom: 0 }}>Past 48 Hours</div>
                  <Sparkline
                    data={historyHeights}
                    color={`var(--alert-${alertClass.toLowerCase()})`}
                    height={44}
                  />
                </div>

                <div className="gauge-footer">
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    Updated: {d?.time ? formatCDT(d.time) : '—'}
                  </div>
                  <div style={{ color: '#60a5fa', fontWeight: '600', fontSize: '0.75rem' }}>View Details →</div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Map */}
      <div className="glass-panel map-container-wrapper" style={{ padding: 0 }}>
        <RiverMap gauges={data} />
      </div>
    </>
  )
}
