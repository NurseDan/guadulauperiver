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

  // Collect height and flow values separately, keyed by site then timestamp
  const heightBySite = {}
  const flowBySite = {}
  const latestBySite = {}

  json.value.timeSeries.forEach(ts => {
    const site = ts.sourceInfo.siteCode[0].value
    const param = ts.variable.variableCode[0].value
    const values = ts.values[0].value.filter(v => Number(v.value) > -900000)
    if (!values.length) return

    const latest = values[values.length - 1]

    if (param === '00065') {
      heightBySite[site] = {}
      values.forEach(v => { heightBySite[site][v.dateTime] = Number(v.value) })
      if (!latestBySite[site]) latestBySite[site] = {}
      latestBySite[site].height = Number(latest.value)
      latestBySite[site].time = latest.dateTime
    }

    if (param === '00060') {
      flowBySite[site] = {}
      values.forEach(v => { flowBySite[site][v.dateTime] = Number(v.value) })
      if (!latestBySite[site]) latestBySite[site] = {}
      latestBySite[site].flow = Number(latest.value)
    }
  })

  // Build result with unified history (height + flow per timestamp)
  const result = {}
  for (const site of Object.keys(latestBySite)) {
    const heights = heightBySite[site] || {}
    const flows = flowBySite[site] || {}

    // All timestamps that have a height reading
    const history = Object.keys(heights)
      .sort()
      .map(time => ({
        time,
        height: heights[time],
        flow: flows[time] ?? null
      }))

    result[site] = {
      ...latestBySite[site],
      history
    }
  }

  return result
}
