import { Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, Mail, Settings, ScrollText } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Emails from './pages/Emails'
import SettingsPage from './pages/Settings'
import Logs from './pages/Logs'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/emails', label: 'Emails', icon: Mail },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function App() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-48 bg-gray-900 border-r border-gray-800 flex flex-col py-6">
        <div className="px-4 mb-6">
          <h1 className="text-lg font-bold text-indigo-400">VMOS Changer</h1>
          <p className="text-xs text-gray-500 mt-1">Gemini Offer Tool</p>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/emails" element={<Emails />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
