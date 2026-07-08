import { useEffect, useRef } from "react";
import { wsUrl } from "@/lib/api-config";
import { useAppStore } from "@/lib/store";
import type { WorkerState } from "@/lib/store";

export function useBackendSocket() {
  const setWsStatus = useAppStore((s) => s.setWsStatus);
  const setWorkers = useAppStore((s) => s.setWorkers);
  const upsertWorker = useAppStore((s) => s.upsertWorker);
  const appendLog = useAppStore((s) => s.appendLog);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let alive = true;

    function connect() {
      if (!alive) return;
      setWsStatus("connecting");
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl("/ws"));
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => setWsStatus("connected");
      ws.onclose = () => {
        setWsStatus("reconnecting");
        scheduleReconnect();
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as {
            type: string;
            pad?: string;
            data?: unknown;
          };
          // Backend broadcasts: snapshot (on connect), worker_state, log, job_done.
          if (msg.type === "snapshot" && msg.data && typeof msg.data === "object") {
            const raw = msg.data as Record<string, Record<string, unknown>>;
            const normalized: Record<string, WorkerState> = {};
            for (const [pad, st] of Object.entries(raw)) {
              normalized[pad] = { ...(st ?? {}), pad_code: pad } as WorkerState;
            }
            setWorkers(normalized);
          } else if ((msg.type === "worker_state" || msg.type === "worker_update") && msg.pad) {
            upsertWorker(msg.pad, (msg.data as Record<string, unknown>) ?? {});
          } else if (msg.type === "log") {
            const d = (msg.data as Record<string, unknown>) ?? {};
            appendLog({
              ts: (d.ts as string) ?? new Date().toISOString(),
              level: (d.level as string) ?? "INFO",
              pad: msg.pad ?? (d.pad as string | undefined),
              message: (d.message as string) ?? String(d.text ?? ""),
            });
          } else if (msg.type === "job_done" && msg.pad) {
            const d = (msg.data as Record<string, unknown>) ?? {};
            upsertWorker(msg.pad, { status: (d.severity as string) ?? "IDLE", step: "done" });
          }
        } catch {
          /* ignore */
        }
      };
    }

    function scheduleReconnect() {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      reconnectRef.current = setTimeout(connect, 3000);
    }

    connect();

    return () => {
      alive = false;
      mountedRef.current = false;
      setWsStatus("closed");
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}