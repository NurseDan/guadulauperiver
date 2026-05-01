export const ALERT_COLORS = {
  GREEN: '#16a34a',
  YELLOW: '#eab308',
  ORANGE: '#f97316',
  RED: '#dc2626',
  BLACK: '#111827'
}

export function alertColor(level = 'GREEN') {
  return ALERT_COLORS[level] || ALERT_COLORS.GREEN
}
