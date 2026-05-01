import { MapContainer, TileLayer, WMSTileLayer, Marker, Polyline, Tooltip } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import { GAUGES } from '../config/gauges'
import { alertColor } from '../lib/alertColors'
import L from 'leaflet'

const getArrow = (rate) => {
  if (rate > 0.1) return '↑'
  if (rate < -0.1) return '↓'
  return '—'
}

export default function RiverMap({ gauges }) {
  const sorted = [...GAUGES].sort((a, b) => a.order - b.order)
  const navigate = useNavigate()

  const flowLine = sorted.map(g => [g.lat, g.lng])

  return (
    <MapContainer center={[30.05, -99.15]} zoom={10} style={{ height: 400, width: '100%', zIndex: 0 }}>
      {/* ESRI Topo Map Base for terrain features */}
      <TileLayer 
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}" 
        attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community"
      />

      {/* Live NEXRAD Radar WMS Layer */}
      <WMSTileLayer 
        url="https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi"
        layers="nexrad-n0r-900913"
        format="image/png"
        transparent={true}
        opacity={0.6}
        attribution="Weather data &copy; IEM Nexrad"
      />

      <Polyline positions={flowLine} pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.8 }} />

      {sorted.map(g => {
        const d = gauges[g.id]
        const color = alertColor(d?.alert)
        const rate = d?.rates?.rise60m || 0
        const arrow = getArrow(rate)

        const iconHtml = `<div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 16px; border: 2px solid white; box-shadow: 0 0 10px ${color}; cursor: pointer;">${arrow}</div>`
        const customIcon = new L.DivIcon({ 
          html: iconHtml, 
          className: 'custom-gauge-icon', 
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        })

        return (
          <Marker 
            key={g.id} 
            position={[g.lat, g.lng]} 
            icon={customIcon}
            eventHandlers={{
              click: () => navigate(`/gauge/${g.id}`)
            }}
          >
            <Tooltip>
              <div>
                <strong>{g.shortName}</strong>
                <div>Level: {d?.height ?? '—'} ft</div>
                <div>Flow: {d?.flow ?? '—'} cfs</div>
                <div>1hr Trend: {rate > 0 ? '+' : ''}{rate.toFixed(2)} ft</div>
                <div>Alert: {d?.alert ?? '—'}</div>
                <div style={{ marginTop: 8, color: '#60a5fa', fontWeight: 'bold' }}>Click for Details</div>
              </div>
            </Tooltip>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
