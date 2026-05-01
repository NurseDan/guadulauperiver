// NWS counties covering the Guadalupe River corridor:
// Kerr (TXC265), Kendall (TXC259), Bandera (TXC019)
const COUNTIES = 'TXC265,TXC259,TXC019'

const FLOOD_EVENTS = new Set([
  'Flood Watch', 'Flood Warning', 'Flood Advisory', 'Flood Statement',
  'Flash Flood Watch', 'Flash Flood Warning', 'Flash Flood Statement',
  'Hydrologic Outlook', 'River Flood Watch', 'River Flood Warning',
  'Areal Flood Watch', 'Areal Flood Warning', 'Areal Flood Advisory'
])

// Map NWS severity+event to our internal level
function classifyAlert(event, severity) {
  if (event.includes('Warning') && (severity === 'Extreme' || severity === 'Severe')) return 'RED'
  if (event.includes('Warning')) return 'ORANGE'
  if (event.includes('Watch')) return 'YELLOW'
  return 'GREEN'
}

export async function fetchNWSAlerts() {
  try {
    const url = `https://api.weather.gov/alerts/active?county=${COUNTIES}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GuadalupeSentinel/1.0 (river monitoring app)' }
    })
    if (!res.ok) throw new Error(`NWS ${res.status}`)
    const json = await res.json()

    const alerts = (json.features || [])
      .map(f => f.properties)
      .filter(p => FLOOD_EVENTS.has(p.event))
      .map(p => ({
        id: p.id,
        event: p.event,
        headline: p.headline,
        description: p.description,
        instruction: p.instruction,
        severity: p.severity,
        urgency: p.urgency,
        areaDesc: p.areaDesc,
        effective: p.effective,
        expires: p.expires,
        level: classifyAlert(p.event, p.severity)
      }))
      .sort((a, b) => {
        const order = { RED: 0, ORANGE: 1, YELLOW: 2, GREEN: 3 }
        return order[a.level] - order[b.level]
      })

    return alerts
  } catch (err) {
    console.warn('NWS alerts fetch failed:', err)
    return []
  }
}
