import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { loadFromSheets, startRun, getJobs } from "@/lib/api";
import type { JobRow } from "@/lib/api";
import { getAutoIntervalMin, getRunMode } from "@/lib/run-mode";
import { notifyTelegram } from "@/lib/telegram";
import { useAppStore } from "@/lib/store";

/**
 * Client-side Auto mode runner.
 * - In "auto": every N minutes, loads Google Sheet; if new mails were added
 *   and no active workers are running, triggers a run with default PADs.
 * - In "manual": does nothing (user must click Start).
 */
export function useAutoMode() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const res = await loadFromSheets();
        if (cancelled) return;
        if (res && !res.error && (res.loaded ?? 0) > 0) {
          toast.success(`Auto: +${res.loaded} email từ Sheet`);
          notifyTelegram(
            `🤖 <b>VMOS Changer · Auto</b>\nĐã tải ${res.loaded} email từ Sheet.`,
          ).catch(() => {});
          // Only auto-start if no worker is currently active.
          const workers = useAppStore.getState().workers;
          const anyActive = Object.values(workers).some(
            (w) => w.status && !["idle", "done", "error", "stopped"].includes(String(w.status)),
          );
          if (!anyActive) {
            // Also skip if backend already has running jobs.
            let hasRunning = false;
            try {
              const jobs = await getJobs();
              const arr: JobRow[] = Array.isArray(jobs)
                ? jobs
                : ((jobs as { jobs?: JobRow[] })?.jobs ?? []);
              hasRunning = arr.some((j) => j.status === "running");
            } catch {
              /* ignore */
            }
            if (!hasRunning) {
              try {
                await startRun();
                notifyTelegram("▶️ <b>VMOS Changer · Auto</b>\nĐã tự động khởi chạy.").catch(() => {});
              } catch (e) {
                toast.error(`Auto start failed: ${(e as Error).message}`);
                notifyTelegram(
                  `⚠️ <b>VMOS Changer · Auto</b>\nTự động khởi chạy thất bại: ${(e as Error).message}`,
                ).catch(() => {});
              }
            }
          }
        }
      } catch (e) {
        console.warn("[auto-mode] tick failed:", e);
      } finally {
        runningRef.current = false;
      }
    }

    function schedule() {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (getRunMode() !== "auto") return;
      const min = getAutoIntervalMin();
      // Fire once shortly after enabling, then on interval.
      const first = setTimeout(tick, 2000);
      timerRef.current = setInterval(tick, Math.max(1, min) * 60_000);
      return () => clearTimeout(first);
    }

    let cleanupFirst = schedule();
    const onChange = () => {
      if (typeof cleanupFirst === "function") cleanupFirst();
      cleanupFirst = schedule();
    };
    window.addEventListener("vmos:run-mode-change", onChange);

    return () => {
      cancelled = true;
      window.removeEventListener("vmos:run-mode-change", onChange);
      if (typeof cleanupFirst === "function") cleanupFirst();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);
}