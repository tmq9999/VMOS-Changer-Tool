import { useState, useEffect } from 'react'
import { Save, Eye, EyeOff } from 'lucide-react'
import { getSettings, saveSettings } from '../api'

interface SettingsData {
  access_key: string
  has_secret_key: boolean
  pad_mode: 'auto' | 'manual'
  manual_pad_codes: string[]
  service_account_json: string
  spreadsheet_id: string
  sheet_name: string
  data_start_row: number
  poll_interval: number
  step_timeout: number
  magisk_timeout: number
  retry_count: number
  worker_start_delay: number
  step_delay: number
  skip_successful: boolean
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-400">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-600">{hint}</p>}
    </div>
  )
}

const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 transition-colors"

export default function SettingsPage() {
  const [cfg, setCfg] = useState<SettingsData | null>(null)
  const [showSk, setShowSk] = useState(false)
  const [secretKey, setSecretKey] = useState('')
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    getSettings().then((s) => {
      setCfg(s)
    })
  }, [])

  if (!cfg) return <div className="p-6 text-gray-500 text-sm">Loading...</div>

  const set = (key: keyof SettingsData, val: unknown) =>
    setCfg((prev) => prev ? { ...prev, [key]: val } : prev)

  const handleSave = async () => {
    const payload: Record<string, unknown> = { ...cfg }
    delete payload.has_secret_key  // không gửi field này về backend
    if (secretKey) payload.secret_key = secretKey
    await saveSettings(payload)
    if (secretKey) {
      setCfg((prev) => prev ? { ...prev, has_secret_key: true } : prev)
      setSecretKey('')
    }
    setSavedMsg('Đã lưu ✓')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Settings</h2>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors font-medium"
        >
          <Save size={14} />
          {savedMsg || 'Save'}
        </button>
      </div>

      {/* VMOS API */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 border-b border-gray-800 pb-2">VMOS API</h3>

        <Field label="Access Key ID">
          <input
            className={inputCls}
            value={cfg.access_key}
            onChange={(e) => set('access_key', e.target.value)}
            placeholder="AK..."
          />
        </Field>

        <Field
          label="Secret Access Key"
          hint={cfg.has_secret_key ? undefined : 'Chưa cấu hình — nhập key để lưu'}
        >
          <div className="space-y-1">
            {cfg.has_secret_key && !secretKey && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/30 border border-green-800 rounded-lg">
                <span className="text-xs text-green-400">✓ Đã cấu hình</span>
                <span className="text-xs text-gray-500 ml-auto">Nhập bên dưới để thay đổi</span>
              </div>
            )}
            <div className="relative">
              <input
                className={inputCls + ' pr-10'}
                type={showSk ? 'text' : 'password'}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder={cfg.has_secret_key ? 'Nhập key mới để ghi đè...' : 'SK...'}
              />
              <button
                type="button"
                onClick={() => setShowSk(!showSk)}
                className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-300"
              >
                {showSk ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
        </Field>

        <Field label="PAD Mode">
          <select
            className={inputCls}
            value={cfg.pad_mode}
            onChange={(e) => set('pad_mode', e.target.value)}
          >
            <option value="auto">Auto detect (userPadList)</option>
            <option value="manual">Manual list</option>
          </select>
        </Field>

        {cfg.pad_mode === 'manual' && (
          <Field label="Manual PAD Codes" hint="Mỗi dòng 1 PAD code">
            <textarea
              className={inputCls}
              rows={4}
              value={cfg.manual_pad_codes.join('\n')}
              onChange={(e) =>
                set('manual_pad_codes', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))
              }
              placeholder="ACP25101482CTO5Z&#10;ACP..."
            />
          </Field>
        )}
      </section>

      {/* Google Sheet */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 border-b border-gray-800 pb-2">Google Sheet</h3>

        <Field label="Spreadsheet ID" hint="ID trong URL: /spreadsheets/d/{ID}/edit">
          <input
            className={inputCls}
            value={cfg.spreadsheet_id}
            onChange={(e) => set('spreadsheet_id', e.target.value)}
            placeholder="1BxiMVs0XRA..."
          />
        </Field>

        <Field label="Sheet Name">
          <input
            className={inputCls}
            value={cfg.sheet_name}
            onChange={(e) => set('sheet_name', e.target.value)}
            placeholder="Sheet1"
          />
        </Field>

        <Field label="Data Start Row" hint="Row đầu tiên chứa data (bỏ qua header)">
          <input
            className={inputCls}
            type="number"
            min={1}
            value={cfg.data_start_row}
            onChange={(e) => set('data_start_row', Number(e.target.value))}
          />
        </Field>

        <Field label="Service Account JSON" hint="Paste nội dung file .json service account">
          <textarea
            className={inputCls + ' font-mono text-xs'}
            rows={6}
            value={cfg.service_account_json}
            onChange={(e) => set('service_account_json', e.target.value)}
            placeholder='{"type":"service_account","project_id":"..."}'
          />
        </Field>
      </section>

      {/* Timing */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 border-b border-gray-800 pb-2">Timing (giây)</h3>
        <div className="grid grid-cols-2 gap-4">
          {([
            ['poll_interval', 'Poll Interval', 'Giây giữa mỗi UI dump poll'],
            ['step_timeout', 'Step Timeout', 'Timeout mỗi state machine'],
            ['magisk_timeout', 'Magisk Timeout', 'Timeout chờ Magisk download'],
            ['retry_count', 'Retry Count', 'Số lần retry khi thất bại'],
            ['worker_start_delay', 'Worker Start Delay', 'Delay giữa các worker khởi động'],
            ['step_delay', 'Step Delay', 'Delay giữa các bước trong flow'],
          ] as [keyof SettingsData, string, string][]).map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint}>
              <input
                className={inputCls}
                type="number"
                step="0.5"
                min={0}
                value={cfg[key] as number}
                onChange={(e) => set(key, Number(e.target.value))}
              />
            </Field>
          ))}
        </div>
      </section>

      {/* Queue Behaviour */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 border-b border-gray-800 pb-2">Queue Behaviour</h3>
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => set('skip_successful', !cfg.skip_successful)}
            className={`w-10 h-6 rounded-full transition-colors relative ${cfg.skip_successful ? 'bg-indigo-600' : 'bg-gray-700'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${cfg.skip_successful ? 'left-5' : 'left-1'}`} />
          </div>
          <div>
            <p className="text-sm text-gray-200">Skip dòng đã SUCCESS</p>
            <p className="text-xs text-gray-500">Bỏ qua các dòng có cột H = SUCCESS khi load từ Sheet</p>
          </div>
        </label>
      </section>
    </div>
  )
}
