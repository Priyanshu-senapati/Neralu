import { MotionConfig } from 'motion/react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
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
      <Routes>
        <Route path="/" element={<Story />} />
        <Route path="/ward" element={<Dashboard />} />
        <Route path="/volunteer" element={<Volunteer />} />
        <Route path="/register" element={<Register />} />
        <Route path="/phone" element={<Phone />} />
      </Routes>
    </BrowserRouter>
    </MotionConfig>
  )
}
