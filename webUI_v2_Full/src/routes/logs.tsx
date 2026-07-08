import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { clearLogs as clearLogsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const LEVELS = ["ALL", "DEBUG", "INFO", "WARN", "ERROR"] as const;

export const Route = createFileRoute("/logs")({
  head: () => ({ meta: [{ title: "Logs · VMOS Changer" }] }),
  component: LogsPage,
});

function LogsPage() {
  const logs = useAppStore((s) => s.logs);
  const clearLocal = useAppStore((s) => s.clearLogs);
  const workers = useAppStore((s) => s.workers);
  const t = useT();
  const [padFilter, setPadFilter] = useState<string>("ALL");
  const [levelFilter, setLevelFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (padFilter !== "ALL" && l.pad !== padFilter) return false;
      if (levelFilter !== "ALL" && (l.level ?? "").toUpperCase() !== levelFilter) return false;
      if (search && !l.message.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [logs, padFilter, levelFilter, search]);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [filtered, autoScroll]);


  const pads = Object.keys(workers);

  const doExport = () => {
    const blob = new Blob(
      [filtered.map((l) => `[${l.ts}] [${l.level}] ${l.pad ?? "-"}: ${l.message}`).join("\n")],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vmos-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doClear = async () => {
    clearLocal();
    try {
      await clearLogsApi();
      toast.success(t("toast.logsCleared"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("logs.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("logs.subtitle")}</p>
      </div>
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>{t("logs.live")} ({filtered.length})</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={padFilter} onValueChange={setPadFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="PAD" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("logs.allPads")}</SelectItem>
                {pads.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder={t("logs.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[220px]"
            />
            <div className="flex items-center gap-2 px-2">
              <Switch id="auto" checked={autoScroll} onCheckedChange={setAutoScroll} />
              <Label htmlFor="auto" className="text-xs">{t("logs.auto")}</Label>
            </div>
            <Button variant="outline" size="sm" onClick={doExport}>
              <Download className="h-4 w-4" /> {t("logs.export")}
            </Button>
            <Button variant="outline" size="sm" onClick={doClear}>
              <Trash2 className="h-4 w-4" /> {t("logs.clear")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[65vh] overflow-auto rounded-md border bg-muted/30 font-mono text-xs">
            {filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                {t("logs.waiting")}
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((l) => (
                  <div
                    key={l.id}
                    className={cn(
                      "grid grid-cols-[auto_auto_auto_1fr] gap-2 border-l-2 px-3 py-1.5",
                      rowBorderColor(l.level),
                    )}
                  >
                    <span className="text-muted-foreground">{shortTs(l.ts)}</span>
                    <span className={cn("inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", levelBadge(l.level))}>
                      {l.level}
                    </span>
                    <span className="text-primary">{l.pad ?? "-"}</span>
                    <span className="whitespace-pre-wrap break-words">{l.message}</span>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function shortTs(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

function levelBadge(l: string) {
  const u = (l ?? "").toUpperCase();
  if (u === "ERROR") return "bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400";
  if (u === "WARN") return "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400";
  if (u === "DEBUG") return "bg-muted text-muted-foreground";
  return "bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400";
}

function rowBorderColor(l: string) {
  const u = (l ?? "").toUpperCase();
  if (u === "ERROR") return "border-l-rose-500";
  if (u === "WARN") return "border-l-amber-500";
  if (u === "DEBUG") return "border-l-transparent";
  return "border-l-sky-500";
}