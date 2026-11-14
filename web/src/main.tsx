import { StrictMode, Suspense, lazy, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import './index.css'
import Home from './pages/Home'

const Lab = lazy(() => import('./pages/Lab'))
const Future = lazy(() => import('./pages/Future'))
const Explore = lazy(() => import('./explore/ExploreApp'))

function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) { const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 60); return () => window.clearTimeout(t) }
    window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

const TITLES: Record<string, string> = { '/': 'Bengaluru From Orbit', '/lab': 'Simulation Lab — Bengaluru From Orbit', '/future': 'Future Earth — Bengaluru From Orbit', '/explore': 'Explorer — Bengaluru From Orbit' }
function Title() { const { pathname } = useLocation(); useEffect(() => { document.title = TITLES[pathname] ?? TITLES['/'] }, [pathname]); return null }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollManager /><Title />
      <Suspense fallback={<div className="flex h-screen items-center justify-center bg-black font-display text-[13px] tracking-[0.3em] text-ink-4">LOADING</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="/future" element={<Future />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
