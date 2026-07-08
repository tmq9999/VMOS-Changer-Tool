import { apiUrl } from "./api-config";

async function j<T = unknown>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface JobRow {
  id: number;
  email: string;
  status: string;
  pad_code?: string | null;
  sheet_row?: number | null;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface StatsResponse {
  total?: number;
  success?: number;
  failed?: number;
  running?: number;
  pending?: number;
  queue_size?: number;
  workers?: number;
  [k: string]: unknown;
}

export interface ValidateResult {
  valid: string[];
  invalid: { line: number; error: string }[];
  valid_count: number;
  invalid_count: number;
}

export interface AddResult {
  added: number;
  skipped_duplicate: number;
  invalid_count: number;
  invalid: { line: number; error: string }[];
}

export interface SheetLoadResult {
  loaded: number;
  skipped_duplicate: number;
  skipped_invalid: number;
  queue_size: number;
}

export interface PadsResult {
  pads: string[];
  source: string;
  total?: number;
  error?: string;
}

export interface AppSettings {
  access_key: string;
  has_secret_key?: boolean;
  secret_key?: string;
  pad_mode: "auto" | "manual";
  manual_pad_codes: string[];
  service_account_json: string;
  spreadsheet_id: string;
  sheet_name: string;
  data_start_row: number;
  poll_interval: number;
  step_timeout: number;
  magisk_timeout: number;
  retry_count: number;
  worker_start_delay: number;
  step_delay: number;
  post_boot_settle: number;
  skip_successful: boolean;
  [k: string]: unknown;
}

export async function getStats() {
  return j<StatsResponse>(await fetch(apiUrl("/api/stats")));
}

export async function getJobs() {
  return j<JobRow[] | { jobs: JobRow[] }>(await fetch(apiUrl("/api/jobs")));
}

export async function getLogs(limit = 200, pad?: string, level?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (pad) params.set("pad", pad);
  if (level) params.set("level", level);
  return j<unknown>(await fetch(apiUrl(`/api/logs?${params}`)));
}

export async function validateEmails(text: string) {
  return j<ValidateResult>(
    await fetch(apiUrl("/api/emails/validate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }),
  );
}

export async function addEmails(text: string) {
  return j<AddResult>(
    await fetch(apiUrl("/api/emails/add"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }),
  );
}

export async function loadFromSheets() {
  return j<SheetLoadResult & { error?: string }>(
    await fetch(apiUrl("/api/sheets/load"), { method: "POST" }),
  );
}

export interface SheetTestResult {
  ok: boolean;
  rows?: number;
  title?: string;
  error?: string;
}

/**
 * Try to test the Sheet connection against the backend. If the backend does
 * not expose a dedicated test endpoint, returns { ok: false, error: "no_endpoint" }
 * so the caller can fall back to a client-side JSON validation.
 */
export async function testSheets(): Promise<SheetTestResult> {
  const res = await fetch(apiUrl("/api/sheets/test"), { method: "POST" });
  if (res.status === 404 || res.status === 405) {
    return { ok: false, error: "no_endpoint" };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: text || `${res.status}` };
  }
  return (await res.json().catch(() => ({ ok: true }))) as SheetTestResult;
}

export async function getPads() {
  return j<PadsResult>(await fetch(apiUrl("/api/pads")));
}

export interface H5TokenResult {
  token: string;
  baseUrl: string;
  padCode: string;
}

export async function getH5Token(padCode: string) {
  return j<H5TokenResult>(
    await fetch(apiUrl(`/api/pads/${encodeURIComponent(padCode)}/h5-token`)),
  );
}

export async function startRun(padCodes?: string[]) {
  return j<{ ok?: boolean; error?: string }>(
    await fetch(apiUrl("/api/run/start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pad_codes: padCodes ?? null }),
    }),
  );
}

export async function stopRun() {
  return j<{ ok?: boolean }>(await fetch(apiUrl("/api/run/stop"), { method: "POST" }));
}

export async function clearLogs() {
  return j<{ ok?: boolean }>(await fetch(apiUrl("/api/logs"), { method: "DELETE" }));
}

export async function clearQueue() {
  return j<{ ok?: boolean }>(await fetch(apiUrl("/api/queue/clear"), { method: "POST" }));
}

export async function getSettings() {
  return j<AppSettings>(await fetch(apiUrl("/api/settings")));
}

export async function saveSettings(data: Partial<AppSettings>) {
  return j<{ ok?: boolean }>(
    await fetch(apiUrl("/api/settings"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}