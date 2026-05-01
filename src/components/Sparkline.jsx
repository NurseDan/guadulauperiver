import React from 'react'

export default function Sparkline({ data, color = '#60a5fa', height = 40, width = 200 }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ height, width: '100%', opacity: 0.5, fontSize: '0.75rem', display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
        Insufficient Data for Chart
      </div>
    )
  }
  
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min === 0 ? 1 : max - min
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((d - min) / range) * (height - 4) - 2 
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible', marginTop: '12px' }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}
