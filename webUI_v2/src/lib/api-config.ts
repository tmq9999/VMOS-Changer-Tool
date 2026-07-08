const KEY = "vmos.backendBase";

export function getBackendBase(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY) || "";
}

export function setBackendBase(url: string): void {
  if (typeof window === "undefined") return;
  const clean = url.trim().replace(/\/$/, "");
  if (clean) localStorage.setItem(KEY, clean);
  else localStorage.removeItem(KEY);
}

export function apiUrl(path: string): string {
  const base = getBackendBase();
  return `${base}${path}`;
}

export function wsUrl(path: string): string {
  const base = getBackendBase();
  if (base) {
    return base.replace(/^http/, "ws") + path;
  }
  if (typeof window === "undefined") return path;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}${path}`;
}