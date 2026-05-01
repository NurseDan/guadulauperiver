export function logIncident(entry) {
  const key = 'sentinel_incidents'
  const existing = JSON.parse(localStorage.getItem(key) || '[]')
  existing.unshift(entry)
  localStorage.setItem(key, JSON.stringify(existing.slice(0, 200)))
}

export function getIncidents() {
  return JSON.parse(localStorage.getItem('sentinel_incidents') || '[]')
}
