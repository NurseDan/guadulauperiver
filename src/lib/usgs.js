const FIFTEEN_MIN_MS = 15 * 60 * 1000
const snap15 = ts => Math.round(ts / FIFTEEN_MIN_MS) * FIFTEEN_MIN_MS

async function attemptFetch(url, signal) {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`USGS ${res.status}`)
  return res.json()
}

export async function fetchUSGSGauges(ids) {
  const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${ids.join(',')}&parameterCd=00065,00060&period=PT48H`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  let json
  try {
    json = await attemptFetch(url, controller.signal)
  } finally {
    clearTimeout(timeout)
  }

  if (!json?.value?.timeSeries) return {}

  // Collect readings keyed by 15-min bucket so height and flow align
  // regardless of exact timestamp offsets between the two USGS parameter streams.
  const heightBySite = {}   // site → bucket_ms → { value, isoTime }
  const flowBySite   = {}   // site → bucket_ms → cfs value
  const latestBySite = {}

  for (const ts of json.value.timeSeries) {
    const site  = ts.sourceInfo.siteCode[0].value
    const param = ts.variable.variableCode[0].value
    const vals  = ts.values[0].value.filter(v => Number(v.value) > -900000)
    if (!vals.length) continue

    const latest = vals[vals.length - 1]

    if (param === '00065') {
      heightBySite[site] = {}
      for (const v of vals) {
        const bucket = snap15(new Date(v.dateTime).getTime())
        heightBySite[site][bucket] = { value: Number(v.value), isoTime: v.dateTime }
      }
      latestBySite[site] = {
        ...latestBySite[site],
        height: Number(latest.value),
        time: latest.dateTime
      }
    }

    if (param === '00060') {
      flowBySite[site] = {}
      for (const v of vals) {
        const bucket = snap15(new Date(v.dateTime).getTime())
        flowBySite[site][bucket] = Number(v.value)
      }
      latestBySite[site] = {
        ...latestBySite[site],
        flow: Number(latest.value)
      }
    }
  }

  const result = {}
  for (const site of Object.keys(latestBySite)) {
    const heights = heightBySite[site] || {}
    const flows   = flowBySite[site]   || {}

    const history = Object.entries(heights)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([bucket, { value, isoTime }]) => ({
        time:   isoTime,
        height: value,
        flow:   flows[Number(bucket)] ?? null
      }))

    result[site] = { ...latestBySite[site], history }
  }

  return result
}
