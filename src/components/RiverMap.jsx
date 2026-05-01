import { MapContainer, TileLayer, WMSTileLayer, Marker, Polyline, Tooltip } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import { GAUGES } from '../config/gauges'
import { alertColor } from '../lib/alertColors'
import L from 'leaflet'

// Map flow (cfs) to stroke width — log scale feel
function flowWidth(cfs) {
  if (!cfs || cfs < 50) return 4
  if (cfs < 300) return 6
  if (cfs < 1000) return 9
  if (cfs < 3000) return 13
  if (cfs < 8000) return 17
  return 21
}

function rateArrow(rate) {
  if (rate > 0.15) return '↑'
  if (rate < -0.15) return '↓'
  return '→'
}

export default function RiverMap({ gauges }) {
  const sorted = [...GAUGES].sort((a, b) => a.order - b.order)
  const navigate = useNavigate()

  // One segment per adjacent gauge pair
  const segments = sorted.slice(0, -1).map((g, i) => {
    const next = sorted[i + 1]
    const d = gauges[g.id]
    return {
      id: `${g.id}-${next.id}`,
      positions: [[g.lat, g.lng], [next.lat, next.lng]],
      color: alertColor(d?.alert),
      width: flowWidth(d?.flow),
      flow: d?.flow,
      upName: g.shortName,
      downName: next.shortName
    }
  })

  return (
    <MapContainer center={[30.01, -99.13]} zoom={10} style={{ height: 520, width: '100%', zIndex: 0 }}>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri"
      />
      <WMSTileLayer
        url="https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi"
        layers="nexrad-n0r-900913"
        format="image/png"
        transparent={true}
        opacity={0.5}
        attribution="Weather &copy; IEM Nexrad"
      />

      {/* Glow layer — wide, low-opacity */}
      {segments.map(s => (
        <Polyline
          key={`glow-${s.id}`}
          positions={s.positions}
          pathOptions={{ color: s.color, weight: s.width + 12, opacity: 0.15, lineCap: 'round' }}
        />
      ))}

      {/* Main colored river segments */}
      {segments.map(s => (
        <Polyline
          key={s.id}
          positions={s.positions}
          pathOptions={{ color: s.color, weight: s.width, opacity: 0.92, lineCap: 'round', lineJoin: 'round' }}
        >
          <Tooltip sticky>
            <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 12 }}>
              <strong>{s.upName} → {s.downName}</strong><br />
              Flow: {s.flow?.toLocaleString() ?? '—'} cfs
            </div>
          </Tooltip>
        </Polyline>
      ))}

      {/* Flow direction dashes — white overlay shows movement */}
      {segments.map(s => (
        <Polyline
          key={`dash-${s.id}`}
          positions={s.positions}
          pathOptions={{ color: 'rgba(255,255,255,0.45)', weight: 1.5, dashArray: '5 14', opacity: 0.7 }}
        />
      ))}

      {/* Gauge markers */}
      {sorted.map(g => {
        const d = gauges[g.id]
        const color = alertColor(d?.alert)
        const ht = d?.height ?? 0
        const floodPct = g.floodStageFt && ht > 0
          ? Math.min((ht / g.floodStageFt) * 100, 100)
          : null
        const rate = d?.rates?.rise60m ?? 0
        const arrow = rateArrow(rate)
        const rateLabel = `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}'`

        const floodBar = floodPct !== null
          ? `<div style="background:rgba(255,255,255,0.08);border-radius:3px;height:4px;margin:4px 0 2px;overflow:hidden">
               <div style="width:${floodPct.toFixed(0)}%;height:100%;background:${color};border-radius:3px"></div>
             </div>
             <div style="font-size:9px;color:#64748b">${floodPct.toFixed(0)}% of flood stage</div>`
          : ''

        const html = `
          <div style="
            font-family:Inter,system-ui,sans-serif;
            background:rgba(10,16,30,0.93);
            border:2px solid ${color};
            border-radius:10px;
            padding:8px 12px 7px;
            box-shadow:0 0 20px ${color}44, 0 4px 14px #00000099;
            min-width:115px;
            cursor:pointer;
          ">
            <div style="font-size:11px;font-weight:700;color:${color};margin-bottom:3px;letter-spacing:0.02em">${g.shortName}</div>
            <div style="display:flex;align-items:baseline;gap:7px;margin-bottom:2px">
              <span style="font-size:18px;font-weight:800;color:#f8fafc;line-height:1">${ht.toFixed(1)}'</span>
              <span style="font-size:10px;color:${color};font-weight:600">${arrow} ${rateLabel}/hr</span>
            </div>
            ${floodBar}
            ${d?.flow !== undefined ? `<div style="font-size:9px;color:#94a3b8;margin-top:3px">${d.flow.toLocaleString()} cfs</div>` : ''}
          </div>
        `

        return (
          <Marker
            key={g.id}
            position={[g.lat, g.lng]}
            icon={new L.DivIcon({ html, className: '', iconSize: [125, 90], iconAnchor: [62, 45] })}
            eventHandlers={{ click: () => navigate(`/gauge/${g.id}`) }}
          >
            <Tooltip direction="top" offset={[0, -50]}>
              <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, lineHeight: 1.6 }}>
                <strong style={{ display: 'block', marginBottom: 2 }}>{g.name}</strong>
                Level: {ht.toFixed(2)} ft &nbsp;·&nbsp; Flow: {d?.flow?.toLocaleString() ?? '—'} cfs<br />
                1hr change: {rate >= 0 ? '+' : ''}{rate.toFixed(2)} ft/hr &nbsp;·&nbsp; Status: {d?.alert ?? '—'}<br />
                {g.floodStageFt ? `Flood stage: ${g.floodStageFt} ft (${floodPct?.toFixed(0) ?? '—'}%)` : 'Flood stage: unknown'}
              </div>
            </Tooltip>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
