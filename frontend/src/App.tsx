import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Phone from './pages/Phone'
import Register from './pages/Register'
import Story from './pages/Story'
import Volunteer from './pages/Volunteer'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Story />} />
        <Route path="/ward" element={<Dashboard />} />
        <Route path="/volunteer" element={<Volunteer />} />
        <Route path="/register" element={<Register />} />
        <Route path="/phone" element={<Phone />} />
      </Routes>
    </BrowserRouter>
  )
}
