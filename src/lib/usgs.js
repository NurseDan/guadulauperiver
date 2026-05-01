export async function fetchUSGSGauges(ids) {
  const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${ids.join(',')}&parameterCd=00065,00060&period=PT48H`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  let json
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`USGS responded with ${res.status}`)
    json = await res.json()
  } finally {
    clearTimeout(timeout)
  }

  if (!json?.value?.timeSeries) return {}

  const result = {}

  json.value.timeSeries.forEach(ts => {
    const site = ts.sourceInfo.siteCode[0].value
    const param = ts.variable.variableCode[0].value
    const values = ts.values[0].value.filter(v => Number(v.value) > -900000)
    if (values.length === 0) return
    
    const latest = values[values.length - 1]

    if (!result[site]) {
      result[site] = { history: [] }
    }

    if (param === '00065') {
      result[site].height = Number(latest.value)
      result[site].history = values.map(v => ({
        time: v.dateTime,
        height: Number(v.value)
      }))
    }
    if (param === '00060') {
      result[site].flow = Number(latest.value)
    }

    if (param === '00065' || !result[site].time) {
      result[site].time = latest.dateTime
    }
  })

  return result
}
