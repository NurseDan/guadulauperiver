export const ALERT_LEVELS = {
  GREEN: {
    label: 'Normal',
    priority: 0,
    description: 'Gauge behavior appears normal.'
  },
  YELLOW: {
    label: 'Early rise detected',
    priority: 1,
    description: 'Water is rising quickly enough to watch closely.'
  },
  ORANGE: {
    label: 'Rapid rise warning',
    priority: 2,
    description: 'Abnormal rise detected. Prepare for possible flooding.'
  },
  RED: {
    label: 'Dangerous rise',
    priority: 3,
    description: 'Dangerous rise pattern detected. Move away from low water areas.'
  },
  BLACK: {
    label: 'Critical / catastrophic',
    priority: 4,
    description: 'Extreme rise or data failure during dangerous conditions.'
  }
}

export function calculateRates(history, current) {
  function delta(minutes) {
    const currentTime = new Date(current.time).getTime()
    const targetMs = minutes * 60 * 1000

    const past = [...history]
      .reverse()
      .find(point => currentTime - new Date(point.time).getTime() >= targetMs)

    if (!past || typeof current.height !== 'number' || typeof past.height !== 'number') {
      return 0
    }

    return current.height - past.height
  }

  return {
    rise5m: delta(5),
    rise15m: delta(15),
    rise60m: delta(60)
  }
}

export function getAlertLevel(rates, options = {}) {
  const { isStale = false, upstreamAlert = 'GREEN' } = options
  const rise5m = rates?.rise5m ?? 0
  const rise15m = rates?.rise15m ?? 0
  const rise60m = rates?.rise60m ?? 0

  if (isStale && ALERT_LEVELS[upstreamAlert]?.priority >= 3) return 'BLACK'
  if (rise5m >= 2 || rise15m >= 4 || rise60m >= 8) return 'BLACK'
  if (rise5m >= 1 || rise15m >= 2 || rise60m >= 4) return 'RED'
  if (rise5m >= 0.5 || rise15m >= 1 || rise60m >= 2) return 'ORANGE'
  if (rise5m >= 0.2 || rise15m >= 0.4 || rise60m >= 0.75) return 'YELLOW'

  return 'GREEN'
}

export function getHighestAlert(alerts) {
  return alerts.reduce((highest, current) => {
    return ALERT_LEVELS[current]?.priority > ALERT_LEVELS[highest]?.priority ? current : highest
  }, 'GREEN')
}
