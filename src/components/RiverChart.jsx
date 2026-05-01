import React, { useMemo } from 'react'
import {
  ComposedChart, Area, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, Brush, Cell
} from 'recharts'

const ALERT_COLORS = {
  GREEN: '#10b981',
  YELLOW: '#f59e0b',
  ORANGE: '#f97316',
  RED: '#ef4444',
  BLACK: '#7f1d1d'
}

const TICK = { fill: '#475569', fontSize: 10, fontFamily: 'Inter,sans-serif' }
const FIFTEEN_MIN = 15 * 60 * 1000

function fmtLabel(ts) {
  return new Date(ts).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  })
}

function fmtTick(ts) {
  const d = new Date(ts)
  const cdtHour = d.toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', hour12: true
  })
  const midnight = d.toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago', hour12: false
  }).startsWith('00:')
  if (midnight) {
    return d.toLocaleDateString('en-US', {
      timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric'
    })
  }
  return cdtHour
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(10,16,30,0.97)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 12,
      fontFamily: 'Inter,sans-serif',
      minWidth: 170,
      pointerEvents: 'none'
    }}>
      <div style={{ color: '#64748b', marginBottom: 8, fontSize: 11 }}>{fmtLabel(label)}</div>
      {payload.map(p => p.value != null && (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 3 }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <strong style={{ color: '#f8fafc' }}>
            {typeof p.value === 'number'
              ? p.unit === ' cfs' ? p.value.toLocaleString() : p.value.toFixed(2)
              : p.value}
            {p.unit || ''}
          </strong>
        </div>
      ))}
    </div>
  )
}

// Merge level history + predictions + hourly precip into 15-min buckets.
// Exported so GaugeDetail can call it before passing chartData in.
export function buildChartData(levelHistory, predictions, precipHourly) {
  const snap = ts => Math.round(ts / FIFTEEN_MIN) * FIFTEEN_MIN
  const map = new Map()

  for (const h of levelHistory) {
    const b = snap(new Date(h.time).getTime())
    map.set(b, { ts: b, level: h.height ?? null, flow: h.flow ?? null })
  }

  for (const p of predictions) {
    const b = snap(new Date(p.time).getTime())
    const existing = map.get(b) || { ts: b }
    map.set(b, { ...existing, predicted: p.height })
  }

  if (precipHourly?.length) {
    for (const p of precipHourly) {
      const hourTs = new Date(p.time).getTime()
      // Spread hourly value across the four 15-min buckets in that hour
      for (let i = 0; i < 4; i++) {
        const b = snap(hourTs + i * FIFTEEN_MIN)
        const existing = map.get(b) || { ts: b }
        map.set(b, { ...existing, rain: p.inches / 4, isForecast: p.isForecast })
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.ts - b.ts)
}

export default function RiverChart({ chartData = [], floodStageFt, alertClass = 'GREEN' }) {
  const color = ALERT_COLORS[alertClass] || ALERT_COLORS.GREEN
  const gradId = `area-${alertClass}`

  const hasFlow = chartData.some(d => d.flow != null)
  const hasPrecip = chartData.some(d => d.rain != null && d.rain > 0.0001)
  const hasPredicted = chartData.some(d => d.predicted != null)

  const xDomain = useMemo(() => {
    const tss = chartData.map(d => d.ts).filter(Boolean)
    return tss.length ? [Math.min(...tss), Math.max(...tss)] : ['dataMin', 'dataMax']
  }, [chartData])

  const rightMargin = hasFlow ? 64 : 24

  if (!chartData.length) {
    return (
      <div style={{
        height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#475569', fontSize: '0.875rem'
      }}>
        Waiting for data — check back after the first refresh.
      </div>
    )
  }

  return (
    <div>
      {/* ── Precipitation chart ── */}
      {hasPrecip && (
        <div style={{ marginBottom: 8 }}>
          <div className="chart-section-label">
            Rainfall &nbsp;<span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#334155' }}>
              (in / 15 min · solid = measured · faded = forecast)
            </span>
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <ComposedChart
              data={chartData}
              syncId="river"
              margin={{ top: 4, right: rightMargin, left: 40, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="ts" type="number" scale="time" domain={xDomain} hide />
              <YAxis tick={TICK} width={36} tickFormatter={v => v.toFixed(2)} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine x={Date.now()} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 4" />
              <Bar dataKey="rain" name="Rainfall" unit='"' isAnimationActive={false} radius={[2, 2, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.isForecast ? 'rgba(96,165,250,0.3)' : 'rgba(96,165,250,0.75)'}
                  />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Level + flow chart ── */}
      <div className="chart-section-label">
        Water Level (ft){hasFlow ? ' + Flow Rate (cfs →)' : ''}
      </div>
      <ResponsiveContainer width="100%" height={310}>
        <ComposedChart
          data={chartData}
          syncId="river"
          margin={{ top: 8, right: rightMargin, left: 40, bottom: 0 }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0.03" />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.05)" />

          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={xDomain}
            tickFormatter={fmtTick}
            tick={TICK}
            minTickGap={56}
          />

          <YAxis
            yAxisId="level"
            tick={TICK}
            width={40}
            tickFormatter={v => `${v}'`}
          />

          {hasFlow && (
            <YAxis
              yAxisId="flow"
              orientation="right"
              tick={TICK}
              width={58}
              tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
            />
          )}

          <Tooltip content={<ChartTooltip />} />

          <Legend
            wrapperStyle={{ paddingTop: 6, fontSize: 11, fontFamily: 'Inter,sans-serif', color: '#94a3b8' }}
          />

          {/* Flood stage */}
          {floodStageFt != null && (
            <ReferenceLine
              yAxisId="level"
              y={floodStageFt}
              stroke="#ef4444"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              label={{
                value: `⚠ Flood Stage ${floodStageFt}'`,
                fill: '#ef4444', fontSize: 10,
                position: 'insideTopLeft',
                fontFamily: 'Inter,sans-serif'
              }}
            />
          )}

          {/* NOW line */}
          <ReferenceLine
            x={Date.now()}
            yAxisId="level"
            stroke="rgba(255,255,255,0.18)"
            strokeDasharray="3 4"
            label={{
              value: 'NOW', fill: 'rgba(255,255,255,0.3)', fontSize: 9,
              position: 'insideTopLeft', fontFamily: 'Inter,sans-serif'
            }}
          />

          {/* Historical water level */}
          <Area
            yAxisId="level"
            type="monotone"
            dataKey="level"
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: 'rgba(15,23,42,0.9)', strokeWidth: 2 }}
            name="Level"
            unit="'"
            connectNulls={false}
            isAnimationActive={false}
          />

          {/* AI-projected level */}
          {hasPredicted && (
            <Line
              yAxisId="level"
              type="monotone"
              dataKey="predicted"
              stroke={color}
              strokeWidth={2}
              strokeDasharray="7 5"
              dot={false}
              activeDot={{ r: 3, fill: color }}
              name="Projected"
              unit="'"
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          {/* Flow rate */}
          {hasFlow && (
            <Line
              yAxisId="flow"
              type="monotone"
              dataKey="flow"
              stroke="#60a5fa"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: '#60a5fa' }}
              name="Flow"
              unit=" cfs"
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          <Brush
            dataKey="ts"
            height={28}
            stroke="rgba(255,255,255,0.07)"
            fill="rgba(10,16,30,0.6)"
            travellerWidth={8}
            tickFormatter={fmtTick}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
