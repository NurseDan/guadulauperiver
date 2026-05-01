export async function fetchPrecipitationForecast(lat, lng) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation&timezone=America/Chicago&forecast_days=2`
    const res = await fetch(url)
    const json = await res.json()
    
    // We only care about the next 12-24 hours
    const now = new Date()
    let totalPrecipitation = 0
    let maxHourly = 0
    let hoursWithRain = 0
    
    const times = json.hourly.time
    const precip = json.hourly.precipitation
    
    for (let i = 0; i < times.length; i++) {
      const forecastTime = new Date(times[i])
      // Only look at future hours up to 24h ahead
      if (forecastTime > now && forecastTime <= new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
        const p = precip[i]
        if (p > 0) {
          totalPrecipitation += p
          hoursWithRain++
          if (p > maxHourly) maxHourly = p
        }
      }
    }
    
    // Convert mm to inches roughly
    const totalInches = totalPrecipitation * 0.0393701
    const maxHourlyInches = maxHourly * 0.0393701
    
    return {
      totalInches,
      maxHourlyInches,
      hoursWithRain,
      raw: json
    }
  } catch (error) {
    console.error("Failed to fetch weather data:", error)
    return null
  }
}
