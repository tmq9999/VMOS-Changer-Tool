import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import { getH5Token } from "@/lib/api";
import { useT } from "@/lib/i18n";

type PadStatus = "connecting" | "connected" | "error" | "disconnected" | "unsupported";

/**
 * Read-only Armcloud RTC video for a single VMOS device.
 * Renders only the video surface + status overlay to fill its parent container
 * (the DeviceCell already provides the card header/footer/aspect box).
 */
export function PadRtcView({ padCode }: { padCode: string }) {
  const t = useT();
  const viewId = useMemo(() => `pad-video-${padCode}`, [padCode]);
  const engineRef = useRef<{ stop: () => Promise<unknown> | void } | null>(null);
  const retryRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const lastFrameTimeRef = useRef<number>(-1);
  const lastProgressAtRef = useRef<number>(Date.now());
  const [status, setStatus] = useState<PadStatus>("connecting");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [attempt, setAttempt] = useState(0);

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

  useEffect(() => {
    let cancelled = false;
    let engine: { stop: () => Promise<unknown> | void; start: () => void } | null = null;

    // Auto-reconnect with exponential backoff: 5s → 10s → 20s → 30s (cap).
    const scheduleRetry = () => {
      if (cancelled || retryRef.current) return;
      const delay = Math.min(5000 * Math.pow(2, attemptCountRef.current), 30000);
      attemptCountRef.current += 1;
      retryRef.current = window.setTimeout(() => {
        retryRef.current = null;
        setAttempt((a) => a + 1);
      }, delay);
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
                scheduleRetry();
              }
            },
            onConnectSuccess: () => {
              if (!cancelled) {
                setStatus("connected");
                attemptCountRef.current = 0;
              }
            },
            onRenderedFirstFrame: () => {
              if (cancelled) return;
              setStatus("connected");
              attemptCountRef.current = 0;
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

    attemptCountRef.current = attempt === 0 ? 0 : attemptCountRef.current;

    boot();

    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="absolute inset-0">
      <div
        id={viewId}
        className="absolute inset-0 h-full w-full overflow-hidden [&>div]:!mx-auto"
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
      {(status === "error" || status === "disconnected") && (
        <button
          type="button"
          title={t("viewer.reconnect")}
          onClick={() => setAttempt((a) => a + 1)}
          className="absolute right-1.5 top-1.5 z-30 flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white transition-colors hover:bg-black/70"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
