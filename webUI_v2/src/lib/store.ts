import { create } from "zustand";

export interface WorkerState {
  pad_code: string;
  status?: string;
  step?: string;
  progress?: number;
  email?: string;
  started_at?: number;
  updated_at?: number;
  [k: string]: unknown;
}

export interface LogEntry {
  id: number;
  ts: string;
  level: string;
  pad?: string;
  message: string;
}

export type WsStatus = "connecting" | "connected" | "reconnecting" | "closed";

interface AppState {
  wsStatus: WsStatus;
  workers: Record<string, WorkerState>;
  logs: LogEntry[];
  selectedPads: string[];
  setSelectedPads: (pads: string[]) => void;
  lastSheetLoad: {
    at: number;
    result: {
      loaded: number;
      skipped_duplicate: number;
      skipped_invalid: number;
      queue_size: number;
    };
    emails: { email: string; sheet_row?: number; status: string }[];
  } | null;
  setWsStatus: (s: WsStatus) => void;
  setWorkers: (w: Record<string, WorkerState>) => void;
  upsertWorker: (pad: string, data: Partial<WorkerState>) => void;
  appendLog: (log: Omit<LogEntry, "id">) => void;
  seedLogs: (logs: Omit<LogEntry, "id">[]) => void;
  clearLogs: () => void;
  setLastSheetLoad: (v: AppState["lastSheetLoad"]) => void;
}

let logId = 0;
const MAX_LOGS = 500;

export const useAppStore = create<AppState>((set) => ({
  wsStatus: "connecting",
  workers: {},
  logs: [],
  selectedPads: [],
  lastSheetLoad: null,
  setWsStatus: (s) => set({ wsStatus: s }),
  setWorkers: (workers) => set({ workers }),
  setSelectedPads: (selectedPads) => set({ selectedPads }),
  upsertWorker: (pad, data) =>
    set((state) => ({
      workers: {
        ...state.workers,
        [pad]: { ...(state.workers[pad] ?? { pad_code: pad }), ...data, pad_code: pad },
      },
    })),
  appendLog: (log) =>
    set((state) => {
      const next = [...state.logs, { ...log, id: ++logId }];
      if (next.length > MAX_LOGS) next.splice(0, next.length - MAX_LOGS);
      return { logs: next };
    }),
  seedLogs: (entries) =>
    set(() => {
      const seeded = entries.map((e) => ({ ...e, id: ++logId }));
      if (seeded.length > MAX_LOGS) seeded.splice(0, seeded.length - MAX_LOGS);
      return { logs: seeded };
    }),
  clearLogs: () => set({ logs: [] }),
  setLastSheetLoad: (v) => set({ lastSheetLoad: v }),
}));