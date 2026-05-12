import React, { useState } from 'react'
import { Activity, AlertTriangle, BarChart2, Map, RefreshCw, Zap, Shield, Bell } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const FEATURES = [
  {
    icon: <Activity size={22} color="#60a5fa" />,
    title: 'Live USGS Data',
    desc: 'Real-time water levels and flow rates from 6 official USGS gauge stations along the Guadalupe River corridor.'
  },
  {
    icon: <AlertTriangle size={22} color="#f97316" />,
    title: 'Flood Alert System',
    desc: 'Color-coded alerts from Normal through Critical. Know the danger level at every station at a glance.'
  },
  {
    icon: <BarChart2 size={22} color="#a78bfa" />,
    title: '48-Hour Trend Charts',
    desc: 'Sparklines and full trend charts show how levels are moving, with rise/fall rates updated every minute.'
  },
  {
    icon: <Map size={22} color="#10b981" />,
    title: 'Interactive River Map',
    desc: 'See all gauge stations plotted on an interactive map with live status indicators for each location.'
  },
  {
    icon: <RefreshCw size={22} color="#60a5fa" />,
    title: 'Auto-Refresh',
    desc: 'The dashboard refreshes automatically every 60 seconds so you always have the latest readings without lifting a finger.'
  },
  {
    icon: <Zap size={22} color="#f59e0b" />,
    title: 'Surge Detection',
    desc: 'Intelligent surge detection flags sudden rapid rises that could indicate flash flooding upstream.'
  }
]

const GAUGES_PREVIEW = [
  { name: 'North Fork near Hunt', level: '4.2', flow: '312', alert: 'GREEN' },
  { name: 'Hunt', level: '6.8', flow: '891', alert: 'YELLOW' },
  { name: 'Kerrville', level: '8.1', flow: '2,140', alert: 'ORANGE' },
  { name: 'Center Point', level: '5.3', flow: '680', alert: 'GREEN' },
]

function PreviewCard({ gauge }) {
  const colors = {
    GREEN: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', text: '#10b981', label: 'Normal' },
    YELLOW: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b', label: 'Elevated' },
    ORANGE: { bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)', text: '#f97316', label: 'Warning' },
  }
  const c = colors[gauge.alert]
  return (
    <div className="landing-preview-card" style={{ '--preview-color': c.text }}>
      <div className="landing-preview-card__top">
        <span className="landing-preview-card__name">{gauge.name}</span>
        <span className="landing-preview-card__badge" style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
          {c.label}
        </span>
      </div>
      <div className="landing-preview-card__metrics">
        <div>
          <div className="landing-preview-card__metric-label">Level</div>
          <span className="landing-preview-card__metric-value">{gauge.level}</span>
          <span className="landing-preview-card__metric-unit"> ft</span>
        </div>
        <div>
          <div className="landing-preview-card__metric-label">Flow</div>
          <span className="landing-preview-card__metric-value">{gauge.flow}</span>
          <span className="landing-preview-card__metric-unit"> cfs</span>
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  const { signInWithGoogle } = useAuth()
  const [loading, setLoading] = useState(false)

  const handleSignIn = async () => {
    setLoading(true)
    await signInWithGoogle()
    setLoading(false)
  }

  return (
    <div className="landing-root">
      {/* ── Nav ── */}
      <nav className="landing-nav">
        <div className="landing-nav__brand">
          <Activity size={24} color="#60a5fa" />
          <span>Guadalupe Sentinel</span>
        </div>
        <button className="landing-btn landing-btn--outline" onClick={handleSignIn} disabled={loading}>
          Sign in
        </button>
      </nav>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <div className="landing-hero__badge">
          <Shield size={13} />
          Free river monitoring tool
        </div>

        <h1 className="landing-hero__title">
          Real-time flood intelligence<br />
          for the <span className="landing-gradient-text">Guadalupe River</span>
        </h1>

        <p className="landing-hero__sub">
          Monitor 6 USGS gauge stations from Hunt to Comfort. Live water levels, flow rates,
          surge alerts, and 48-hour trend charts — refreshed every 60 seconds.
        </p>

        <div className="landing-hero__cta">
          <button
            className="landing-btn landing-btn--primary landing-btn--lg"
            onClick={handleSignIn}
            disabled={loading}
          >
            {loading ? (
              <span className="landing-spinner" />
            ) : (
              <GoogleIcon />
            )}
            {loading ? 'Redirecting…' : 'Continue with Google'}
          </button>
          <p className="landing-hero__cta-sub">Free to use · No credit card</p>
        </div>

        {/* Preview Cards */}
        <div className="landing-preview-grid">
          {GAUGES_PREVIEW.map(g => <PreviewCard key={g.name} gauge={g} />)}
        </div>
        <p className="landing-preview-note">Sample data — sign in for live readings</p>
      </section>

      {/* ── Features ── */}
      <section className="landing-features">
        <div className="landing-section-header">
          <h2 className="landing-section-title">Everything you need to stay safe</h2>
          <p className="landing-section-sub">
            Built for Texas Hill Country residents, campers, tubers, and anyone who needs
            to know what the Guadalupe is doing right now.
          </p>
        </div>

        <div className="landing-features-grid">
          {FEATURES.map(f => (
            <div key={f.title} className="landing-feature-card">
              <div className="landing-feature-card__icon">{f.icon}</div>
              <h3 className="landing-feature-card__title">{f.title}</h3>
              <p className="landing-feature-card__desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Stations strip ── */}
      <section className="landing-stations">
        <div className="landing-section-header">
          <h2 className="landing-section-title">6 stations, one corridor</h2>
          <p className="landing-section-sub">From the headwaters at Hunt downstream to Comfort — every key point monitored.</p>
        </div>
        <div className="landing-stations-list">
          {['North Fork near Hunt', 'Hunt', 'Above Kerrville', 'Kerrville', 'Center Point', 'Comfort'].map((name, i) => (
            <div key={name} className="landing-station-pill">
              <span className="landing-station-pill__num">{i + 1}</span>
              {name}
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="landing-final-cta">
        <div className="landing-final-cta__inner glass-panel">
          <Bell size={32} color="#60a5fa" style={{ marginBottom: 16 }} />
          <h2 className="landing-final-cta__title">Ready to monitor the river?</h2>
          <p className="landing-final-cta__sub">
            Sign up free and get instant access to live data, trend charts, and flood alerts.
          </p>
          <button
            className="landing-btn landing-btn--primary landing-btn--lg"
            onClick={handleSignIn}
            disabled={loading}
          >
            {loading ? <span className="landing-spinner" /> : <GoogleIcon />}
            {loading ? 'Redirecting…' : 'Get started with Google'}
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} Guadalupe Sentinel</span>
        <span>Data sourced from <a href="https://waterdata.usgs.gov" target="_blank" rel="noopener noreferrer" className="landing-footer-link">USGS National Water Information System</a></span>
      </footer>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  )
}
