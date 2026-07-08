import { useState, useEffect, useCallback } from 'react'
import { Play, Square, RefreshCw, CheckCircle, AlertCircle, XCircle, Clock, Cpu } from 'lucide-react'
import { getStats, startRun, stopRun, getPads } from '../api'
import { useWebSocket } from '../useWebSocket'

interface WorkerState {
  pad: string
  status: string
  email: string
  step: string
}

interface Stats {
  TOTAL: number
  QUEUED: number
  RUNNING: number
  SUCCESS: number
  WARN: number
  ERROR: number
  QUEUE_SIZE: number
  WORKERS: Record<string, WorkerState>
}

const STEP_LABELS: Record<string, string> = {
  step1_new_device: '1. New Device',
  step2_login_google: '2. Login Google',
  step3_install_google_one: '3. Install Google One',
  step4_magisk_on: '4. Magisk ON',
  step5_spoof: '5. Spoof Props',
  step6_get_offer: '6. Get Offer',
}

const STATUS_STYLES: Record<string, string> = {
  IDLE: 'text-gray-400',
  RUNNING: 'text-blue-400',
  STOPPED: 'text-gray-600',
  SUCCESS: 'text-green-400',
  ERROR: 'text-red-400',
  WARN: 'text-orange-400',
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [workers, setWorkers] = useState<Record<string, WorkerState>>({})
  const [logs, setLogs] = useState<Array<{ pad: string; level: string; message: string }>>([])
  const [isRunning, setIsRunning] = useState(false)

  const refresh = useCallback(async () => {
    const s = await getStats()
    setStats(s)
    setWorkers(s.WORKERS || {})
    const hasRunning = (Object.values(s.WORKERS || {}) as WorkerState[]).some(
      (w) => w.status === 'RUNNING'
    )
    setIsRunning(hasRunning)
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  useWebSocket(useCallback((msg) => {
    if (msg.type === 'worker_state') {
      setWorkers(prev => ({ ...prev, [msg.pad]: msg.data as WorkerState }))
    } else if (msg.type === 'log') {
      const d = msg.data as { level: string; message: string; pad: string }
      setLogs(prev => [{ pad: d.pad, level: d.level, message: d.message }, ...prev].slice(0, 50))
    } else if (msg.type === 'snapshot') {
      setWorkers(msg.data as Record<string, WorkerState>)
    }
  }, []))

  const handleStart = async () => {
    const padsResp = await getPads()
    await startRun(padsResp.pads || [])
    setIsRunning(true)
    refresh()
  }

  const handleStop = async () => {
    await stopRun()
    setIsRunning(false)
    refresh()
  }

  const statCards = [
    { label: 'Total',   value: stats?.TOTAL   ?? 0, icon: Cpu,         color: 'text-gray-300' },
    { label: 'Queue',   value: stats?.QUEUE_SIZE ?? 0, icon: Clock,    color: 'text-blue-400' },
    { label: 'Success', value: stats?.SUCCESS  ?? 0, icon: CheckCircle, color: 'text-green-400' },
    { label: 'Warning', value: stats?.WARN     ?? 0, icon: AlertCircle, color: 'text-orange-400' },
    { label: 'Error',   value: stats?.ERROR    ?? 0, icon: XCircle,     color: 'text-red-400' },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-100">Dashboard</h2>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {isRunning ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-1.5 text-sm bg-red-600 hover:bg-red-500 rounded-lg transition-colors font-medium"
            >
              <Square size={14} /> Stop
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors font-medium"
            >
              <Play size={14} /> Start
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">{label}</span>
              <Icon size={14} className={color} />
            </div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Workers */}
      <div>
        <h3 className="text-sm font-medium text-gray-400 mb-3">Workers</h3>
        <div className="space-y-2">
          {Object.values(workers).length === 0 ? (
            <p className="text-sm text-gray-600 py-4 text-center bg-gray-900 rounded-xl border border-gray-800">
              Chưa có worker nào — nhấn Start để bắt đầu
            </p>
          ) : (
            Object.values(workers).map((w) => (
              <div
                key={w.pad}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4"
              >
                <div className="w-32 font-mono text-xs text-gray-300 truncate">{w.pad}</div>
                <div className={`w-20 text-xs font-medium ${STATUS_STYLES[w.status] ?? 'text-gray-400'}`}>
                  {w.status}
                </div>
                <div className="flex-1 text-xs text-gray-400 truncate">{w.email || '—'}</div>
                <div className="text-xs text-gray-500">
                  {STEP_LABELS[w.step] ?? w.step ?? ''}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Live Logs */}
      <div>
        <h3 className="text-sm font-medium text-gray-400 mb-3">Live Logs</h3>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-52 overflow-y-auto font-mono text-xs space-y-1">
          {logs.length === 0 ? (
            <p className="text-gray-600">Chưa có log...</p>
          ) : (
            logs.map((l, i) => (
              <div key={i} className={`${l.level === 'ERROR' ? 'text-red-400' : l.level === 'WARN' ? 'text-orange-400' : 'text-gray-300'}`}>
                <span className="text-gray-600 mr-2">[{l.pad}]</span>{l.message}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
