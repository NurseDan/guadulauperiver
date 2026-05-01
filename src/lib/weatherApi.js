// Returns past 48h of actual precipitation + next 24h forecast in one call.
// Open-Meteo past_days=2 gives the last 48h of observed data at no cost.
export async function fetchPrecipitationForecast(lat, lng) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation&timezone=America/Chicago&past_days=2&forecast_days=1`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Weather API ${res.status}`)
    const json = await res.json()

    const now = new Date()
    const times = json.hourly.time
    const precip = json.hourly.precipitation

    // Full hourly array: past 48h (actual) + next 24h (forecast)
    const hourly = times.map((t, i) => {
      const dt = new Date(t)
      const inches = parseFloat(((precip[i] || 0) * 0.0393701).toFixed(4))
      return {
        time: t,
        inches,
        isForecast: dt > now
      }
    })

    // Summary stats for next 24h only (used by AI predictor)
    const next24End = new Date(now.getTime() + 24 * 3600 * 1000)
    let totalInches = 0, maxHourlyInches = 0, hoursWithRain = 0
    for (const h of hourly) {
      if (h.isForecast && new Date(h.time) <= next24End) {
        totalInches += h.inches
        if (h.inches > maxHourlyInches) maxHourlyInches = h.inches
        if (h.inches > 0) hoursWithRain++
      }
    }

    return { totalInches, maxHourlyInches, hoursWithRain, hourly }
  } catch (error) {
    console.error('Failed to fetch weather data:', error)
    return null
  }
}
