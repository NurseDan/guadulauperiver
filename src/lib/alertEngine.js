export const ALERT_LEVELS = {
  GREEN:  { label: 'Normal',             priority: 0, description: 'Gauge behavior is within normal range.' },
  YELLOW: { label: 'Moderate rise',      priority: 1, description: 'Rising faster than usual — watch closely.' },
  ORANGE: { label: 'Rapid rise',         priority: 2, description: 'Abnormal rise rate. Prepare for possible flooding.' },
  RED:    { label: 'Dangerous rise',     priority: 3, description: 'Dangerous rise. Move away from low-water areas.' },
  BLACK:  { label: 'Critical / extreme', priority: 4, description: 'Extreme rise or sensor failure in hazardous conditions.' }
}

// Find the reading closest to `targetMinutes` ago, accepting a ±60% window.
// Returns { height, ageMs } or null if no suitable reading found.
function findNearest(history, currentTime, targetMinutes) {
  const targetMs  = targetMinutes * 60 * 1000
  const windowMin = targetMs * 0.4
  let best = null
  let bestDist = Infinity

  for (const p of history) {
    if (typeof p.height !== 'number') continue
    const ageMs = currentTime - new Date(p.time).getTime()
    if (ageMs < windowMin) continue  // too recent — skip current reading itself
    const dist = Math.abs(ageMs - targetMs)
    if (dist < bestDist) { bestDist = dist; best = { height: p.height, ageMs } }
  }
  return best
}

export function calculateRates(history, current) {
  if (!current?.time || typeof current.height !== 'number') {
    return { rise15m: 0, rate1h: 0, rate3h: 0 }
  }

  const currentTime = new Date(current.time).getTime()

  // rise15m — absolute feet changed in the last ~15 min (quick spike detection)
  const p15 = findNearest(history, currentTime, 15)
  const rise15m = p15 ? current.height - p15.height : 0

  // rate1h / rate3h — normalised to ft/hr so they're comparable regardless of gap size
  function ratePerHour(targetMinutes) {
    const p = findNearest(history, currentTime, targetMinutes)
    if (!p) return 0
    const hours = p.ageMs / 3600000
    if (hours < 0.1) return 0
    return (current.height - p.height) / hours
  }

  return {
    rise15m,               // ft (absolute, ~15-min window)
    rate1h:  ratePerHour(60),   // ft/hr (~1-hr window)
    rate3h:  ratePerHour(180),  // ft/hr (~3-hr window)
  }
}

export function getAlertLevel(rates) {
  const rise15m = rates?.rise15m ?? 0
  const rate1h  = rates?.rate1h  ?? 0

  // Thresholds calibrated for the Guadalupe River flash-flood behaviour
  if (rise15m >= 2.0 || rate1h >= 8)    return 'BLACK'
  if (rise15m >= 1.0 || rate1h >= 4)    return 'RED'
  if (rise15m >= 0.5 || rate1h >= 2)    return 'ORANGE'
  if (rise15m >= 0.2 || rate1h >= 0.75) return 'YELLOW'

  return 'GREEN'
}

export function getHighestAlert(alerts) {
  return alerts.reduce((highest, current) =>
    (ALERT_LEVELS[current]?.priority ?? 0) > (ALERT_LEVELS[highest]?.priority ?? 0)
      ? current : highest
  , 'GREEN')
}
