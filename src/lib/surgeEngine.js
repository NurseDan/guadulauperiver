import { GAUGES } from '../config/gauges'
import { ALERT_LEVELS } from './alertEngine'

export function detectSurges(gaugeData) {
  const sorted = [...GAUGES].sort((a, b) => a.order - b.order)
  const events = []

  sorted.forEach((gauge, index) => {
    const data = gaugeData[gauge.id]
    if (!data) return

    const alertPriority = ALERT_LEVELS[data.alert]?.priority ?? 0
    const downstream = sorted[index + 1]

    const fastRise =
      (data.rates?.rise5m ?? 0) >= 0.5 ||
      (data.rates?.rise15m ?? 0) >= 1 ||
      alertPriority >= 2

    if (fastRise && downstream) {
      events.push({
        sourceGaugeId: gauge.id,
        sourceName: gauge.shortName,
        downstreamGaugeId: downstream.id,
        downstreamName: downstream.shortName,
        alert: data.alert,
        message: `Upstream surge detected at ${gauge.shortName}. Watch ${downstream.shortName} next.`,
        createdAt: new Date().toISOString()
      })
    }
  })

  return events
}

export function getDownstreamRisk(gaugeId, surgeEvents) {
  return surgeEvents.find(event => event.downstreamGaugeId === gaugeId)
}
