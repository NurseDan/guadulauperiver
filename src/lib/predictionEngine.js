function weightedLeastSquares(xs, ys, ws) {
  let sw = 0, swx = 0, swy = 0, swxy = 0, swxx = 0
  for (let i = 0; i < xs.length; i++) {
    const w = ws[i]
    sw += w; swx += w * xs[i]; swy += w * ys[i]
    swxy += w * xs[i] * ys[i]; swxx += w * xs[i] * xs[i]
  }
  const denom = sw * swxx - swx * swx
  if (Math.abs(denom) < 1e-10) return null
  const slope = (sw * swxy - swx * swy) / denom
  const intercept = (swy - slope * swx) / sw
  return { slope, intercept }
}

// Project the current trend forward using the last 2h of data.
// Returns array of {time, height} at 15-min intervals.
export function projectTrend(history, forecastHours = 6) {
  if (!history || history.length < 3) return []

  const sorted = [...history]
    .filter(h => h.height != null && isFinite(h.height))
    .sort((a, b) => new Date(a.time) - new Date(b.time))

  const now = Date.now()
  const windowMs = 2 * 3600 * 1000
  const recent = sorted.filter(h => now - new Date(h.time).getTime() <= windowMs)
  if (recent.length < 2) return []

  const t0 = new Date(recent[0].time).getTime()
  const tLast = new Date(recent.at(-1).time).getTime()
  const span = tLast - t0 || 1

  const xs = recent.map(h => (new Date(h.time).getTime() - t0) / 60000)
  const ys = recent.map(h => h.height)
  // Exponential recency weighting — most recent data counts most
  const ws = recent.map(h => Math.exp(4 * (new Date(h.time).getTime() - t0) / span))

  const reg = weightedLeastSquares(xs, ys, ws)
  if (!reg) return []

  const xLast = (tLast - t0) / 60000
  const steps = forecastHours * 4 // 15-min intervals

  return Array.from({ length: steps }, (_, i) => {
    const minsAhead = (i + 1) * 15
    const height = Math.max(0, reg.slope * (xLast + minsAhead) + reg.intercept)
    return {
      time: new Date(tLast + minsAhead * 60000).toISOString(),
      height
    }
  })
}

// Add a rain-driven surge on top of the trend projection.
// Uses a bell-curve peaking 3h after heaviest rain.
export function rainAdjustPredictions(predictions, forecast) {
  if (!predictions.length || !forecast || forecast.totalInches <= 0) return predictions

  // Rough Guadalupe basin heuristic: 1" => ~0.45ft surge at peak
  const totalSurge = Math.min(
    forecast.totalInches * 0.45 + forecast.maxHourlyInches * 0.25,
    5
  )
  const peakHour = 3
  const sigma = 1.5

  return predictions.map((p, i) => {
    const hoursOut = (i + 1) * 0.25
    const multiplier = Math.exp(-0.5 * ((hoursOut - peakHour) / sigma) ** 2)
    return { ...p, height: p.height + totalSurge * multiplier }
  })
}
