import { useState } from 'react'
import { Upload, PlusCircle, Database, Trash2 } from 'lucide-react'
import { validateEmails, addEmails, loadFromSheets } from '../api'

async function clearQueue() {
  const r = await fetch('/api/queue/clear', { method: 'POST' })
  return r.json()
}

interface ValidationResult {
  valid: string[]
  invalid: Array<{ line: number; error: string }>
  valid_count: number
  invalid_count: number
}

export default function Emails() {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<ValidationResult | null>(null)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const handleValidate = async () => {
    if (!text.trim()) return
    setLoading(true)
    const r = await validateEmails(text)
    setPreview(r)
    setLoading(false)
  }

  const handleAdd = async () => {
    if (!text.trim()) return
    setLoading(true)
    const r = await addEmails(text)
    const parts = [`✓ Thêm: ${r.added}`]
    if (r.skipped_duplicate > 0) parts.push(`bỏ trùng: ${r.skipped_duplicate}`)
    if (r.invalid_count > 0) parts.push(`lỗi: ${r.invalid_count}`)
    setMsg(parts.join(' | '))
    setPreview(null)
    setText('')
    setLoading(false)
  }

  const handleLoadSheet = async () => {
    setLoading(true)
    const r = await loadFromSheets()
    if (r.error) {
      setMsg(`✗ ${r.error}`)
    } else {
      const parts = [`✓ Load: ${r.loaded}`]
      if (r.skipped_duplicate > 0) parts.push(`bỏ trùng: ${r.skipped_duplicate}`)
      if (r.skipped_invalid > 0) parts.push(`không hợp lệ: ${r.skipped_invalid}`)
      setMsg(parts.join(' | '))
    }
    setLoading(false)
  }

  const handleClearQueue = async () => {
    if (!confirm('Xóa toàn bộ queue và jobs?')) return
    setLoading(true)
    await clearQueue()
    setMsg('✓ Đã xóa toàn bộ queue')
    setLoading(false)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Emails</h2>
        <div className="flex gap-2">
          <button
            onClick={handleClearQueue}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-red-900/60 hover:bg-red-800 disabled:opacity-50 rounded-lg transition-colors"
          >
            <Trash2 size={14} /> Clear Queue
          </button>
          <button
            onClick={handleLoadSheet}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg transition-colors"
          >
            <Database size={14} /> Load từ Google Sheet
          </button>
        </div>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.startsWith('✓') ? 'bg-green-900/40 text-green-300 border border-green-800' : 'bg-red-900/40 text-red-300 border border-red-800'}`}>
          {msg}
        </div>
      )}

      {/* Input */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <p className="text-xs text-gray-500">
          Format: <code className="text-indigo-400">email@gmail.com|Password|2FA_SECRET</code> — mỗi dòng 1 email. 2FA Secret là bắt buộc.
        </p>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null) }}
          placeholder="email1@gmail.com|Pass1|JBSWY3DPEHPK3PXP&#10;email2@gmail.com|Pass2|JBSWY3DPEHPK3PXP"
          rows={8}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
        />
        <div className="flex gap-2">
          <button
            onClick={handleValidate}
            disabled={loading || !text.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg transition-colors"
          >
            <Upload size={14} /> Validate
          </button>
          <button
            onClick={handleAdd}
            disabled={loading || !text.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors font-medium"
          >
            <PlusCircle size={14} /> Add to Queue
          </button>
        </div>
      </div>

      {/* Validation preview */}
      {preview && (
        <div className="space-y-3">
          <div className="flex gap-4 text-sm">
            <span className="text-green-400 font-medium">✓ Valid: {preview.valid_count}</span>
            <span className="text-red-400 font-medium">✗ Invalid: {preview.invalid_count}</span>
          </div>

          {preview.invalid.length > 0 && (
            <div className="bg-gray-900 border border-red-900 rounded-xl p-4 space-y-1">
              <p className="text-xs text-red-400 font-medium mb-2">Dòng lỗi:</p>
              {preview.invalid.map(({ line, error }) => (
                <div key={line} className="text-xs">
                  <span className="text-gray-500">Dòng {line}: </span>
                  <span className="text-red-400">{error}</span>
                </div>
              ))}
            </div>
          )}

          {preview.valid.length > 0 && (
            <div className="bg-gray-900 border border-green-900 rounded-xl p-4 space-y-1">
              <p className="text-xs text-green-400 font-medium mb-2">Email hợp lệ:</p>
              {preview.valid.map((raw, i) => (
                <div key={i} className="text-xs font-mono text-gray-300">
                  {raw.split('|')[0]}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
