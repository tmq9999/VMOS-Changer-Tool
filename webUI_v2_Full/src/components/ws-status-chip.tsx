import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export function WsStatusChip() {
  const status = useAppStore((s) => s.wsStatus);
  const t = useT();
  const color =
    status === "connected"
      ? "bg-emerald-500"
      : status === "connecting"
        ? "bg-sky-500 animate-pulse"
        : status === "reconnecting"
          ? "bg-amber-500 animate-pulse"
          : "bg-muted-foreground";
  const label =
    status === "connected"
      ? t("ws.live")
      : status === "connecting"
        ? t("ws.connecting")
        : status === "reconnecting"
          ? t("ws.reconnecting")
          : t("ws.offline");
  return (
    <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      {label}
    </div>
  );
}