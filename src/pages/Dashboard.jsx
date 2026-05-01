import React from 'react'
import { Link } from 'react-router-dom'
import { GAUGES } from '../config/gauges'
import { ALERT_LEVELS } from '../lib/alertEngine'
import RiverMap from '../components/RiverMap'
import Sparkline from '../components/Sparkline'

export default function Dashboard({ data, formatCDT, highestAlert, lastUpdate }) {
  return (
    <>
      <div className="dashboard-grid">
        {GAUGES.map(g => {
          const d = data[g.id]
          const alertClass = d?.alert || 'GREEN'
          const alertLabel = ALERT_LEVELS[alertClass]?.label || 'Normal'
          
          const historyHeights = d?.history 
            ? d.history.map(h => h.height).filter(h => typeof h === 'number' && !isNaN(h)) 
            : []
            
          const sparklineColor = `var(--alert-${alertClass.toLowerCase()})`

          return (
            <Link to={`/gauge/${g.id}`} key={g.id} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="glass-panel gauge-card">
                <div className="gauge-header">
                  <div className="gauge-name">{g.name}</div>
                  <div className={`alert-badge ${alertClass}`}>
                    {alertLabel}
                  </div>
                </div>

                <div className="gauge-metrics">
                  <div className="metric">
                    <div className="metric-label">Water Level</div>
                    <div>
                      <span className="metric-value">{d?.height !== undefined ? d.height.toFixed(2) : '—'}</span>
                      <span className="metric-unit"> ft</span>
                    </div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Flow Rate</div>
                    <div>
                      <span className="metric-value">{d?.flow !== undefined ? d.flow.toLocaleString() : '—'}</span>
                      <span className="metric-unit"> cfs</span>
                    </div>
                  </div>
                  <div className="metric">
                    <div className="metric-label">Flood Stage</div>
                    <div>
                      <span className="metric-value" style={{ fontSize: '1.25rem' }}>{g.floodStageFt ? g.floodStageFt : 'N/A'}</span>
                      {g.floodStageFt && <span className="metric-unit"> ft</span>}
                    </div>
                  </div>
                </div>
                
                <div style={{ marginBottom: '16px' }}>
                  <div className="metric-label" style={{ marginBottom: '0' }}>Past 2 Hours</div>
                  <Sparkline data={historyHeights} color={sparklineColor} />
                </div>

                <div className="gauge-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px', marginTop: 'auto' }}>
                  <div style={{ color: '#e2e8f0', fontWeight: '500' }}>
                    Gauge Updated: <span style={{ color: '#94a3b8' }}>{d?.time ? formatCDT(d.time) : '—'}</span>
                  </div>
                  <div style={{ color: '#60a5fa', fontWeight: '600' }}>View Details &rarr;</div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      <div className="glass-panel map-container-wrapper" style={{ padding: 0 }}>
        <RiverMap gauges={data} />
      </div>
    </>
  )
}
