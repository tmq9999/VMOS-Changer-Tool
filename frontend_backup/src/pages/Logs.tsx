import { useState, useEffect, useCallback, useRef } from 'react'
import { Trash2, Filter } from 'lucide-react'
import { getLogs, clearLogs } from '../api'
import { useWebSocket } from '../useWebSocket'

interface LogEntry {
  id: number
  pad_code: string
  level: string
  message: string
  created_at: string
}

const LEVEL_STYLES: Record<string, string> = {
  ERROR: 'text-red-400',
  WARN:  'text-orange-400',
  INFO:  'text-gray-300',
  DEBUG: 'text-gray-600',
}

let _wsLogId = Date.now()

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filterPad, setFilterPad] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadLogs = useCallback(async () => {
    const data = await getLogs(300, filterPad || undefined, filterLevel || undefined)
    setLogs(data)
  }, [filterPad, filterLevel])

  useEffect(() => { loadLogs() }, [loadLogs])

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  useWebSocket(useCallback((msg) => {
    if (msg.type === 'log') {
      const d = msg.data as LogEntry & { pad: string }
      const entry: LogEntry = {
        id: ++_wsLogId,
        pad_code: d.pad,
        level: d.level,
        message: d.message,
        created_at: new Date().toISOString(),
      }
      setLogs(prev => [...prev, entry].slice(-500))
    }
  }, []))

  return (
    <div className="p-6 flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Logs</h2>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-500" />
          <input
            value={filterPad}
            onChange={(e) => setFilterPad(e.target.value)}
            placeholder="Filter PAD..."
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:border-indigo-500"
          />
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
          >
            <option value="">All levels</option>
            <option value="ERROR">ERROR</option>
            <option value="WARN">WARN</option>
            <option value="INFO">INFO</option>
          </select>
          <label className="flex items-center gap-1 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>
          <button
            onClick={async () => { await clearLogs(); setLogs([]) }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors"
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>
      </div>

      <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-y-auto font-mono text-xs space-y-0.5 min-h-0">
        {logs.length === 0 ? (
          <p className="text-gray-600">Chưa có log nào...</p>
        ) : (
          logs.map((l) => (
            <div key={l.id} className="flex gap-2 py-0.5 hover:bg-gray-800/50 px-1 rounded">
              <span className="text-gray-600 shrink-0 w-20 truncate">{l.pad_code || '—'}</span>
              <span className={`shrink-0 w-12 ${LEVEL_STYLES[l.level] ?? 'text-gray-400'}`}>
                {l.level}
              </span>
              <span className="text-gray-300 break-all">{l.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
