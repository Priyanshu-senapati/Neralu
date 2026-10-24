import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { reducedMotion } from './motion'
import CaseRecord from './pages/CaseRecord'
import Dashboard from './pages/Dashboard'
import Family from './pages/Family'
import Phone from './pages/Phone'
import Register from './pages/Register'
import Responsible from './pages/Responsible'
import Story from './pages/Story'
import Volunteer from './pages/Volunteer'

export default function App() {
  return (
    // Reduced motion (OS setting) or '?still': every motion animation shows its finished state.
    <MotionConfig reducedMotion={reducedMotion() ? 'always' : 'user'}>
      <BrowserRouter>
        <PageTransitions />
      </BrowserRouter>
    </MotionConfig>
  )
}

/**
 * Moving between pages cross-fades: the old page fades out, the new one fades in at the top.
 * Opacity only: a transform or filter on this wrapper would break the console's fixed elements
 * (the drawer, the demo controls), which are positioned against the viewport.
 */
function PageTransitions() {
  const location = useLocation()

  useEffect(() => {
    // A new page starts at the top (instantly: the fade is the transition), unless a #section was asked for.
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
    else window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname, location.hash])

  const routes = (
    <Routes location={location}>
      <Route path="/" element={<Story />} />
      <Route path="/ward" element={<Dashboard />} />
      <Route path="/ward/record/:id" element={<CaseRecord />} />
      <Route path="/volunteer" element={<Volunteer />} />
      <Route path="/register" element={<Register />} />
      <Route path="/phone" element={<Phone />} />
      <Route path="/family" element={<Family />} />
      <Route path="/responsible" element={<Responsible />} />
    </Routes>
  )
  // Reduced motion: switch pages instantly (a fade that cannot run must never leave a blank page).
  if (reducedMotion()) return routes

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.42, ease: [0.23, 1, 0.32, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
        >
          {routes}
        </motion.div>
      </AnimatePresence>
      <RouteSweep path={location.pathname} />
    </>
  )
}

/**
 * Between pages, a line of light (sun gold to atmosphere blue, the story page's colours) runs
 * across the top of the screen and fades: a small, quick cue that the page changed. It is its own
 * fixed layer, so it never moves the page or the console's fixed panels.
 */
function RouteSweep({ path }: { path: string }) {
  // initial={false}: no sweep on the first page load, only when the page changes.
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={path}
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px] origin-left bg-[linear-gradient(90deg,#ffc861,#ff8a3d_45%,#7cc4ff)] shadow-[0_0_14px_rgba(255,150,70,0.7)]"
        initial={{ scaleX: 0, opacity: 1 }}
        animate={{ scaleX: 1, opacity: [1, 1, 0], transition: { duration: 0.7, ease: [0.23, 1, 0.32, 1], opacity: { duration: 0.9, times: [0, 0.6, 1] } } }}
        exit={{ opacity: 0, transition: { duration: 0.1 } }}
      />
    </AnimatePresence>
  )
}
