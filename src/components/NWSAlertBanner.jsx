import React, { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, X } from 'lucide-react'

const LEVEL_STYLES = {
  RED:    { bg: 'rgba(239,68,68,0.13)',   border: 'rgba(239,68,68,0.45)',   color: '#fca5a5', icon: '#ef4444' },
  ORANGE: { bg: 'rgba(249,115,22,0.13)',  border: 'rgba(249,115,22,0.45)',  color: '#fdba74', icon: '#f97316' },
  YELLOW: { bg: 'rgba(245,158,11,0.13)',  border: 'rgba(245,158,11,0.40)',  color: '#fcd34d', icon: '#f59e0b' },
  GREEN:  { bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.30)',  color: '#6ee7b7', icon: '#10b981' },
}

function fmtExpires(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    hour12: true, timeZoneName: 'short'
  })
}

function AlertItem({ alert }) {
  const [expanded, setExpanded] = useState(false)
  const s = LEVEL_STYLES[alert.level] || LEVEL_STYLES.YELLOW

  return (
    <div style={{
      background: s.bg,
      border: `1px solid ${s.border}`,
      borderRadius: 10,
      marginBottom: 8,
      overflow: 'hidden'
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '12px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        <AlertTriangle size={16} color={s.icon} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: s.color, fontWeight: 700, fontSize: '0.85rem' }}>{alert.event}</div>
          <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: 2, lineHeight: 1.4 }}>
            {alert.headline || alert.areaDesc}
          </div>
          {alert.expires && (
            <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 4 }}>
              Expires: {fmtExpires(alert.expires)}
            </div>
          )}
        </div>
        <div style={{ color: '#475569', flexShrink: 0 }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {expanded && (
        <div style={{
          padding: '0 16px 14px 42px',
          color: '#94a3b8',
          fontSize: '0.78rem',
          lineHeight: 1.65,
          whiteSpace: 'pre-wrap'
        }}>
          {alert.description && <p style={{ margin: '0 0 10px' }}>{alert.description}</p>}
          {alert.instruction && (
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              borderLeft: `3px solid ${s.icon}`,
              padding: '8px 12px',
              borderRadius: '0 6px 6px 0',
              color: s.color,
              fontWeight: 500
            }}>
              {alert.instruction}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function NWSAlertBanner({ alerts }) {
  const [dismissed, setDismissed] = useState(false)
  if (!alerts?.length || dismissed) return null

  const topLevel = alerts[0].level
  const s = LEVEL_STYLES[topLevel] || LEVEL_STYLES.YELLOW
  const label = topLevel === 'RED' ? 'Flood Warning' : topLevel === 'ORANGE' ? 'Flood Warning' : 'Flood Watch'

  return (
    <div style={{ marginBottom: 20 }} role="alert" aria-live="polite">
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: s.color,
          fontWeight: 700,
          fontSize: '0.8rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase'
        }}>
          <AlertTriangle size={14} color={s.icon} />
          NWS {label}{alerts.length > 1 ? ` · ${alerts.length} active alerts` : ''}
        </div>
        <button
          onClick={() => setDismissed(true)}
          title="Dismiss alerts"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#475569', padding: 4
          }}
        >
          <X size={14} />
        </button>
      </div>
      {alerts.map(a => <AlertItem key={a.id} alert={a} />)}
    </div>
  )
}
