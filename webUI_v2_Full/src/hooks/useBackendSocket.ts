import { useEffect, useRef } from "react";
import { wsUrl } from "@/lib/api-config";
import { useAppStore } from "@/lib/store";
import { notifyTelegram } from "@/lib/telegram";

interface BatchDoneData {
  batch_num: number;
  total: number;
  success: number;
  failed: number;
  success_rows: string[];
  failed_rows: string[];
  fail_reasons: string[];
  duration_min: number;
  time: string;
}

function formatBatchMessage(d: BatchDoneData): string {
  const lines = [
    `📊 <b>Batch #${d.batch_num}</b>: ${d.total} mail — ${d.duration_min} phút`,
    `✅ Thành công: ${d.success}${d.success_rows.length ? ` (Dòng ${d.success_rows.join(",")})` : ""}`,
  ];
  if (d.failed > 0) {
    lines.push(`❌ Thất bại: ${d.failed} (Dòng ${d.failed_rows.join(",")})`);
    const reasons = Array.from(new Set(d.fail_reasons)).filter(Boolean);
    if (reasons.length) lines.push(`Lý do: ${reasons.join("; ")}`);
  }
  lines.push(`🕐 Time: ${d.time}`);
  return lines.join("\n");
}

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
          if (msg.type === "snapshot" && msg.data && typeof msg.data === "object") {
            setWorkers(msg.data as Record<string, never>);
          } else if (msg.type === "worker_update" && msg.pad) {
            upsertWorker(msg.pad, (msg.data as Record<string, unknown>) ?? {});
          } else if (msg.type === "log") {
            const d = (msg.data as Record<string, unknown>) ?? {};
            appendLog({
              ts: (d.ts as string) ?? new Date().toISOString(),
              level: (d.level as string) ?? "INFO",
              pad: msg.pad,
              message: (d.message as string) ?? String(d.text ?? ""),
            });
          } else if (msg.type === "job_update" && msg.pad) {
            upsertWorker(msg.pad, (msg.data as Record<string, unknown>) ?? {});
          } else if (msg.type === "batch_done" && msg.data) {
            const d = msg.data as BatchDoneData;
            const text = formatBatchMessage(d);
            appendLog({
              ts: new Date().toISOString(),
              level: d.failed > 0 ? "WARN" : "SUCCESS",
              message: `Batch #${d.batch_num} xong: ${d.success}/${d.total} thành công (${d.duration_min} phút)`,
            });
            notifyTelegram(text).catch(() => {});
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