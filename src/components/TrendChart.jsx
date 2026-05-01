import React, { useMemo } from 'react'

const VW = 800
const MARGIN = { top: 22, right: 30, bottom: 48, left: 54 }

const COLORS = {
  GREEN: '#10b981',
  YELLOW: '#f59e0b',
  ORANGE: '#f97316',
  RED: '#ef4444',
  BLACK: '#991b1b'
}

export default function TrendChart({
  history = [],
  predictions = [],
  floodStageFt,
  alertClass = 'GREEN',
  chartHeight = 260
}) {
  const innerW = VW - MARGIN.left - MARGIN.right
  const innerH = chartHeight - MARGIN.top - MARGIN.bottom
  const color = COLORS[alertClass] || COLORS.GREEN
  const gradId = `tg-${alertClass}`

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    const allPts = [...history, ...predictions].filter(d => d && isFinite(d.height))
    if (!allPts.length) return {}
    const times = allPts.map(d => new Date(d.time).getTime())
    const hts = allPts.map(d => d.height)
    const rawMin = Math.min(...hts)
    const rawMax = Math.max(...hts)
    const pad = Math.max((rawMax - rawMin) * 0.12, 0.5)
    return {
      xMin: Math.min(...times),
      xMax: Math.max(...times),
      yMin: Math.max(0, rawMin - pad),
      yMax: floodStageFt
        ? Math.max(floodStageFt * 1.06, rawMax + pad)
        : rawMax + pad
    }
  }, [history, predictions, floodStageFt])

  if (xMin === undefined) {
    return (
      <div style={{ height: chartHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.875rem' }}>
        Insufficient data for chart
      </div>
    )
  }

  const xs = t => ((t - xMin) / (xMax - xMin)) * innerW
  const ys = h => innerH - ((h - yMin) / (yMax - yMin)) * innerH

  // Y-axis ticks
  const range = yMax - yMin
  const step = range <= 2 ? 0.5 : range <= 6 ? 1 : range <= 15 ? 2 : range <= 40 ? 5 : 10
  const yTicks = []
  let v = Math.ceil(yMin / step) * step
  while (v <= yMax + 0.001) {
    yTicks.push(parseFloat(v.toFixed(2)))
    v = parseFloat((v + step).toFixed(2))
  }

  // X-axis ticks every 6h
  const SIX_H = 6 * 3600 * 1000
  const xTicks = []
  let t = Math.ceil(xMin / SIX_H) * SIX_H
  while (t <= xMax) { xTicks.push(t); t += SIX_H }

  const toPoints = arr =>
    [...arr]
      .filter(d => d && isFinite(d.height))
      .sort((a, b) => new Date(a.time) - new Date(b.time))
      .map(d => `${xs(new Date(d.time).getTime()).toFixed(1)},${ys(d.height).toFixed(1)}`)
      .join(' ')

  const histSorted = [...history]
    .filter(d => d && isFinite(d.height))
    .sort((a, b) => new Date(a.time) - new Date(b.time))

  const areaD = histSorted.length >= 2
    ? `M${xs(new Date(histSorted[0].time).getTime()).toFixed(1)},${innerH} ` +
      histSorted.map(d => `L${xs(new Date(d.time).getTime()).toFixed(1)},${ys(d.height).toFixed(1)}`).join(' ') +
      ` L${xs(new Date(histSorted.at(-1).time).getTime()).toFixed(1)},${innerH} Z`
    : ''

  const histPoints = toPoints(history)
  const predPoints = toPoints(predictions)
  const last = histSorted.at(-1)
  const nowX = xs(Date.now())
  const floodY = floodStageFt != null ? ys(floodStageFt) : null

  return (
    <svg
      width="100%"
      height={chartHeight}
      viewBox={`0 0 ${VW} ${chartHeight}`}
      preserveAspectRatio="none"
      style={{ overflow: 'visible', display: 'block' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
        <clipPath id={`cc-${gradId}`}>
          <rect x="0" y="-4" width={innerW + 2} height={innerH + 8} />
        </clipPath>
      </defs>

      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {/* Horizontal grid lines + Y labels */}
        {yTicks.map(val => {
          const y = ys(val)
          return (
            <g key={val}>
              <line x1={0} y1={y} x2={innerW} y2={y} stroke="rgba(255,255,255,0.055)" strokeWidth={1} />
              <text x={-8} y={y + 4} fill="#475569" fontSize={11} textAnchor="end" fontFamily="Inter,sans-serif">
                {val}'
              </text>
            </g>
          )
        })}

        {/* X ticks + labels */}
        {xTicks.map(tick => {
          const x = xs(tick)
          const d = new Date(tick)
          const isNewDay = d.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour12: false }).startsWith('00:')
          const label = d.toLocaleString('en-US', {
            timeZone: 'America/Chicago',
            hour: 'numeric',
            hour12: true,
            ...(isNewDay ? { month: 'short', day: 'numeric' } : {})
          })
          return (
            <g key={tick}>
              <line x1={x} y1={innerH} x2={x} y2={innerH + 5} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
              <text x={x} y={innerH + 20} fill={isNewDay ? '#94a3b8' : '#475569'} fontSize={10} textAnchor="middle" fontFamily="Inter,sans-serif">
                {label}
              </text>
              {isNewDay && (
                <line x1={x} y1={0} x2={x} y2={innerH} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
              )}
            </g>
          )
        })}

        {/* Area fill */}
        {areaD && <path d={areaD} fill={`url(#${gradId})`} clipPath={`url(#cc-${gradId})`} />}

        {/* Flood stage */}
        {floodY !== null && floodY >= 0 && floodY <= innerH && (
          <g>
            <line x1={0} y1={floodY} x2={innerW} y2={floodY} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="6,4" />
            <rect x={innerW - 92} y={floodY - 17} width={92} height={14} rx={3} fill="rgba(15,23,42,0.7)" />
            <text x={innerW - 46} y={floodY - 6} fill="#ef4444" fontSize={10} textAnchor="middle" fontFamily="Inter,sans-serif">
              Flood Stage {floodStageFt}'
            </text>
          </g>
        )}

        {/* NOW vertical */}
        {nowX >= 0 && nowX <= innerW && (
          <g>
            <line x1={nowX} y1={0} x2={nowX} y2={innerH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="3,4" />
            <text x={nowX + 4} y={14} fill="rgba(255,255,255,0.38)" fontSize={9} fontFamily="Inter,sans-serif">NOW</text>
          </g>
        )}

        {/* Historical line */}
        {histPoints && (
          <polyline
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={histPoints}
            clipPath={`url(#cc-${gradId})`}
          />
        )}

        {/* Prediction dashed line */}
        {predPoints && (
          <polyline
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeDasharray="7,5"
            strokeLinecap="round"
            opacity={0.55}
            points={predPoints}
            clipPath={`url(#cc-${gradId})`}
          />
        )}

        {/* Current level dot */}
        {last && (
          <circle
            cx={xs(new Date(last.time).getTime())}
            cy={ys(last.height)}
            r={5}
            fill={color}
            stroke="rgba(15,23,42,0.9)"
            strokeWidth={2}
          />
        )}

        {/* Axes */}
        <line x1={0} y1={0} x2={0} y2={innerH} stroke="rgba(255,255,255,0.1)" />
        <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="rgba(255,255,255,0.1)" />
      </g>
    </svg>
  )
}
