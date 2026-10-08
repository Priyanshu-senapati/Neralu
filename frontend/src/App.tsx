import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { reducedMotion } from './motion'
import Dashboard from './pages/Dashboard'
import Phone from './pages/Phone'
import Register from './pages/Register'
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
      <Route path="/volunteer" element={<Volunteer />} />
      <Route path="/register" element={<Register />} />
      <Route path="/phone" element={<Phone />} />
    </Routes>
  )
  // Reduced motion: switch pages instantly (a fade that cannot run must never leave a blank page).
  if (reducedMotion()) return routes

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.32, ease: [0.23, 1, 0.32, 1] } }}
        exit={{ opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
      >
        {routes}
      </motion.div>
    </AnimatePresence>
  )
}
