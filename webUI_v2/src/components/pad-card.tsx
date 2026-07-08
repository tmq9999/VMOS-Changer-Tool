import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getH5Token } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";

type PadStatus = "connecting" | "connected" | "error" | "disconnected" | "unsupported";

export function PadCard({ padCode }: { padCode: string }) {
  const t = useT();
  const viewId = useMemo(() => `pad-video-${padCode}`, [padCode]);
  const engineRef = useRef<{ stop: () => Promise<unknown> | void } | null>(null);
  const retryRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(-1);
  const lastProgressAtRef = useRef<number>(Date.now());
  const [status, setStatus] = useState<PadStatus>("connecting");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [attempt, setAttempt] = useState(0);

  // Stream aspect (width/height) — updated on first frame; default typical phone portrait.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [streamAR, setStreamAR] = useState(0.5);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  // Fit the video box to the stage while preserving the stream aspect ratio.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      if (w / h > streamAR) {
        setBox({ w: Math.round(h * streamAR), h });
      } else {
        setBox({ w, h: Math.round(w / streamAR) });
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [streamAR]);

  // Stall watchdog: SDK may report "connected" while the stream is frozen (black)
  // after a device reboot. Detect no video progress and force a fast reconnect.
  useEffect(() => {
    if (status !== "connected") return;
    lastFrameTimeRef.current = -1;
    lastProgressAtRef.current = Date.now();
    const STALL_MS = 6000;
    const id = window.setInterval(() => {
      const video = document
        .getElementById(viewId)
        ?.querySelector("video") as HTMLVideoElement | null;
      const now = Date.now();
      if (video && !video.paused && video.currentTime !== lastFrameTimeRef.current) {
        lastFrameTimeRef.current = video.currentTime;
        lastProgressAtRef.current = now;
      } else if (now - lastProgressAtRef.current > STALL_MS) {
        setAttempt((a) => a + 1);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [viewId, status, attempt]);

  // Latest log line for this pad (single, shown large).
  const logs = useAppStore((s) => s.logs);
  const latestLog = useMemo(() => {
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].pad === padCode) return logs[i];
    }
    return undefined;
  }, [logs, padCode]);

  useEffect(() => {
    let cancelled = false;
    let engine: { stop: () => Promise<unknown> | void; start: () => void } | null = null;

    // Auto-reconnect: the device may be mid-reset/reboot (e.g. while the tool runs),
    // so keep retrying until it becomes reachable again.
    const scheduleRetry = () => {
      if (cancelled || retryRef.current) return;
      retryRef.current = window.setTimeout(() => {
        retryRef.current = null;
        setAttempt((a) => a + 1);
      }, 4000);
    };

    async function boot() {
      setStatus("connecting");
      setErrorMsg("");
      try {
        const { ArmcloudEngine } = await import("@/lib/armcloud-rtc");
        if (cancelled) return;

        if (!ArmcloudEngine.isSupported()) {
          setStatus("unsupported");
          return;
        }

        const { token, baseUrl } = await getH5Token(padCode);
        if (cancelled) return;

        engine = new ArmcloudEngine({
          token,
          baseUrl,
          viewId,
          // View-only: no local mic/camera capture.
          enableMicrophone: false,
          enableCamera: false,
          retryCount: 2,
          retryTime: 2000,
          deviceInfo: {
            padCode,
            userId: `viewer-${padCode}`,
            mediaType: 3,
            autoRecoveryTime: 0,
          },
          callbacks: {
            onInit: async ({ code, msg }) => {
              if (cancelled) return;
              if (code === 0) {
                engine?.start();
              } else {
                setStatus("error");
                setErrorMsg(msg || `init ${code}`);
              }
            },
            onConnectSuccess: () => {
              if (!cancelled) setStatus("connected");
            },
            onRenderedFirstFrame: (event) => {
              if (cancelled) return;
              setStatus("connected");
              if (event?.width && event?.height) {
                setStreamAR(event.width / event.height);
              }
            },
            onConnectFail: ({ code, msg }) => {
              if (cancelled) return;
              setStatus("error");
              setErrorMsg(msg || `connect ${code}`);
              scheduleRetry();
            },
            onConnectionStateChanged: ({ state }) => {
              if (cancelled) return;
              if (state === 1 || state === 6) setStatus("disconnected");
              else if (state === 3 || state === 5) setStatus("connected");
            },
            onErrorMessage: ({ code }) => {
              if (!cancelled) {
                setStatus("error");
                setErrorMsg(`error ${code}`);
                scheduleRetry();
              }
            },
            onAutoRecoveryTime: () => {
              if (!cancelled) {
                setStatus("disconnected");
                scheduleRetry();
              }
            },
          },
        }) as unknown as typeof engine;

        engineRef.current = engine;
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setErrorMsg((e as Error).message);
          scheduleRetry();
        }
      }
    }

    boot();

    return () => {
      cancelled = true;
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
      try {
        engine?.stop();
      } catch {
        /* ignore */
      }
      engineRef.current = null;
    };
  }, [padCode, viewId, attempt]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-2 py-1">
        <span className="truncate font-mono text-[11px] font-semibold" title={padCode}>
          {padCode}
        </span>
        <div className="flex items-center gap-1">
          <StatusBadge status={status} t={t} />
          {(status === "error" || status === "disconnected") && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              title={t("viewer.reconnect")}
              onClick={() => setAttempt((a) => a + 1)}
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Stage centers a box sized to the exact stream aspect ratio — no black bars. */}
      <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
        <div
          className="relative overflow-hidden bg-black"
          style={box ? { width: box.w, height: box.h } : { width: "100%", height: "100%" }}
        >
          <div
            id={viewId}
            className="absolute inset-0 h-full w-full [&_video]:!h-full [&_video]:!w-full [&_video]:!object-cover [&_canvas]:!h-full [&_canvas]:!w-full [&_canvas]:!object-cover"
          />
          {/* View-only: transparent overlay swallows all pointer/touch input. */}
          <div className="absolute inset-0 z-10" aria-hidden />
          {status !== "connected" && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 px-2 text-center text-xs text-white">
              {status === "connecting" && t("viewer.connecting")}
              {status === "unsupported" && t("viewer.unsupported")}
              {status === "disconnected" && t("viewer.disconnected")}
              {status === "error" && (
                <span className="flex flex-col items-center gap-1">
                  <span className="text-rose-300" title={errorMsg}>
                    {t("viewer.error")}
                  </span>
                  <span className="text-[10px] text-white/70">{t("viewer.retrying")}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Latest step only — large & readable */}
      <div className="flex shrink-0 items-center gap-2 border-t bg-muted/40 px-3 py-2">
        {latestLog ? (
          <>
            <span className={cn("shrink-0 text-xs font-bold", levelColor(latestLog.level))}>
              {latestLog.level}
            </span>
            <span className="truncate text-sm font-medium" title={latestLog.message}>
              {latestLog.message}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
              {shortTs(latestLog.ts)}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">{t("viewer.noLogs")}</span>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, t }: { status: PadStatus; t: (k: string) => string }) {
  const map: Record<PadStatus, { label: string; className: string }> = {
    connecting: { label: t("viewer.connecting"), className: "bg-amber-500/15 text-amber-600" },
    connected: { label: t("viewer.connected"), className: "bg-emerald-500/15 text-emerald-600" },
    error: { label: t("viewer.error"), className: "bg-rose-500/15 text-rose-600" },
    disconnected: { label: t("viewer.disconnected"), className: "bg-slate-500/15 text-slate-600" },
    unsupported: { label: t("viewer.unsupported"), className: "bg-rose-500/15 text-rose-600" },
  };
  const s = map[status];
  return (
    <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", s.className)}>
      {s.label}
    </Badge>
  );
}

function shortTs(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

function levelColor(l: string) {
  const u = (l ?? "").toUpperCase();
  if (u === "ERROR") return "text-rose-600";
  if (u === "WARN") return "text-amber-600";
  if (u === "DEBUG") return "text-muted-foreground";
  return "text-sky-600";
}
