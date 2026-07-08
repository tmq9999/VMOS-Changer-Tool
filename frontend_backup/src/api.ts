const BASE = '/api'

export async function getStats() {
  const r = await fetch(`${BASE}/stats`)
  return r.json()
}

export async function getJobs() {
  const r = await fetch(`${BASE}/jobs`)
  return r.json()
}

export async function getLogs(limit = 200, pad?: string, level?: string) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (pad) params.set('pad', pad)
  if (level) params.set('level', level)
  const r = await fetch(`${BASE}/logs?${params}`)
  return r.json()
}

export async function validateEmails(text: string) {
  const r = await fetch(`${BASE}/emails/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  return r.json()
}

export async function addEmails(text: string) {
  const r = await fetch(`${BASE}/emails/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  return r.json()
}

export async function loadFromSheets() {
  const r = await fetch(`${BASE}/sheets/load`, { method: 'POST' })
  return r.json()
}

export async function getPads() {
  const r = await fetch(`${BASE}/pads`)
  return r.json()
}

export async function startRun(padCodes?: string[]) {
  const r = await fetch(`${BASE}/run/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pad_codes: padCodes ?? null }),
  })
  return r.json()
}

export async function stopRun() {
  const r = await fetch(`${BASE}/run/stop`, { method: 'POST' })
  return r.json()
}

export async function clearLogs() {
  const r = await fetch(`${BASE}/logs`, { method: 'DELETE' })
  return r.json()
}

export async function getSettings() {
  const r = await fetch(`${BASE}/settings`)
  return r.json()
}

export async function saveSettings(data: Record<string, unknown>) {
  const r = await fetch(`${BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return r.json()
}
