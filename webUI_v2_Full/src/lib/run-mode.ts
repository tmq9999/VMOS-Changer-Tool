const MODE_KEY = "vmos.runMode";
const INTERVAL_KEY = "vmos.autoIntervalMin";

export type RunMode = "auto" | "manual";

export function getRunMode(): RunMode {
  if (typeof window === "undefined") return "manual";
  const v = localStorage.getItem(MODE_KEY);
  return v === "auto" ? "auto" : "manual";
}

export function setRunMode(mode: RunMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MODE_KEY, mode);
  window.dispatchEvent(new CustomEvent("vmos:run-mode-change"));
}

export function getAutoIntervalMin(): number {
  if (typeof window === "undefined") return 5;
  const raw = localStorage.getItem(INTERVAL_KEY);
  const n = raw ? Number(raw) : 5;
  return Number.isFinite(n) && n >= 1 ? n : 5;
}

export function setAutoIntervalMin(min: number): void {
  if (typeof window === "undefined") return;
  const v = Math.max(1, Math.floor(min));
  localStorage.setItem(INTERVAL_KEY, String(v));
  window.dispatchEvent(new CustomEvent("vmos:run-mode-change"));
}