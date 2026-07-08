import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  CloudDownload,
  Cpu,
  Layers,
  Loader2,
  Mail,
  Play,
  Plus,
  ScrollText,
  Square,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/kpi-card";
import { WorkerCard } from "@/components/worker-card";
import { PadPicker } from "@/components/pad-picker";
import { useAppStore } from "@/lib/store";
import {
  addEmails,
  clearLogs,
  clearQueue,
  getJobs,
  getStats,
  loadFromSheets,
  startRun,
  stopRun,
} from "@/lib/api";
import type { JobRow } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  isTelegramEnabled,
  notifyTelegram,
  setTelegramEnabled,
} from "@/lib/telegram";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Dashboard · VMOS Changer" }],
  }),
  component: Dashboard,
});

function Dashboard() {
  const workers = useAppStore((s) => s.workers);
  const logs = useAppStore((s) => s.logs);
  const queryClient = useQueryClient();
  const [selectedPads, setSelectedPads] = useState<string[]>([]);
  const [quickText, setQuickText] = useState("");
  const [telegramEnabled, setTelegramEnabledState] = useState(false);
  const t = useT();
  const logsBottom = useRef<HTMLDivElement | null>(null);
  const recentLogs = useMemo(() => logs.slice(-40), [logs]);
  useEffect(() => {
    logsBottom.current?.scrollIntoView({ block: "end" });
  }, [recentLogs.length]);

  useEffect(() => {
    setTelegramEnabledState(isTelegramEnabled());
    const onChange = () => setTelegramEnabledState(isTelegramEnabled());
    window.addEventListener("vmos:telegram-change", onChange);
    return () => window.removeEventListener("vmos:telegram-change", onChange);
  }, []);

  const statsQ = useQuery({ queryKey: ["stats"], queryFn: getStats, refetchInterval: 5000 });
  const jobsQ = useQuery({ queryKey: ["jobs"], queryFn: getJobs, refetchInterval: 5000 });

  const jobs: JobRow[] = useMemo(() => {
    const d = jobsQ.data;
    if (Array.isArray(d)) return d;
    if (d && Array.isArray((d as { jobs?: JobRow[] }).jobs)) return (d as { jobs: JobRow[] }).jobs;
    return [];
  }, [jobsQ.data]);

  const stats = statsQ.data ?? {};
  const workerList = Object.values(workers);

  const startM = useMutation({
    mutationFn: () => startRun(selectedPads.length ? selectedPads : undefined),
    onSuccess: (r) => {
      if (r.error) {
        toast.error(r.error);
      } else {
        toast.success(t("toast.startedWorkers"));
        notifyTelegram("▶️ <b>VMOS Changer</b>\nĐã khởi động chạy.").catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const stopM = useMutation({
    mutationFn: stopRun,
    onSuccess: () => {
      toast.success(t("toast.stopSent"));
      notifyTelegram("⏹️ <b>VMOS Changer</b>\nĐã gửi tín hiệu dừng.").catch(() => {});
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const clearQ = useMutation({
    mutationFn: clearQueue,
    onSuccess: () => {
      toast.success(t("toast.queueCleared"));
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const clearL = useMutation({
    mutationFn: clearLogs,
    onSuccess: () => toast.success(t("toast.logsCleared")),
    onError: (e: Error) => toast.error(e.message),
  });

  const addM = useMutation({
    mutationFn: () => addEmails(quickText),
    onSuccess: (r) => {
      toast.success(
        t("emails.toastAdded", { added: r.added, dup: r.skipped_duplicate, inv: r.invalid_count }),
      );
      setQuickText("");
      if (r.added > 0) {
        notifyTelegram(`📥 <b>VMOS Changer</b>\nĐã thêm ${r.added} email vào hàng đợi.`).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sheetM = useMutation({
    mutationFn: loadFromSheets,
    onSuccess: (r) => {
      if (r.error) return toast.error(r.error);
      toast.success(
        t("emails.toastLoaded", {
          loaded: r.loaded,
          dup: r.skipped_duplicate,
          inv: r.skipped_invalid,
        }),
      );
      if (r.loaded > 0) {
        notifyTelegram(`📥 <b>VMOS Changer</b>\nĐã tải ${r.loaded} email từ Google Sheet.`).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("dash.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("dash.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label={t("kpi.total")} value={num(stats.total)} icon={Layers} />
        <KpiCard label={t("kpi.success")} value={num(stats.success)} icon={CheckCircle2} tone="success" />
        <KpiCard label={t("kpi.failed")} value={num(stats.failed)} icon={XCircle} tone="danger" />
        <KpiCard label={t("kpi.running")} value={num(stats.running)} icon={Activity} tone="info" />
        <KpiCard label={t("kpi.queue")} value={num(stats.queue_size ?? stats.pending)} icon={Layers} />
        <KpiCard label={t("kpi.workers")} value={workerList.length || num(stats.workers)} icon={Cpu} tone="info" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>{t("dash.workers")}</CardTitle>
            <Badge variant="outline">{workerList.length} {t("dash.active")}</Badge>
          </CardHeader>
          <CardContent>
            {workerList.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                {t("dash.noWorker")}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 auto-rows-fr sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {workerList.map((w) => (
                  <WorkerCard key={w.pad_code} w={w} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dash.controls")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PadPicker selected={selectedPads} onChange={setSelectedPads} />
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="tg-toggle" className="text-sm font-medium">
                  {t("dash.sendTg")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {telegramEnabled ? t("dash.sendTgOn") : t("dash.sendTgOff")}
                </p>
              </div>
              <Switch
                id="tg-toggle"
                checked={telegramEnabled}
                onCheckedChange={(v) => {
                  setTelegramEnabled(v);
                  setTelegramEnabledState(v);
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => startM.mutate()} disabled={startM.isPending}>
                {startM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {t("dash.start")}
              </Button>
              <Button variant="outline" onClick={() => stopM.mutate()} disabled={stopM.isPending}>
                <Square className="h-4 w-4" /> {t("dash.stop")}
              </Button>
              <Button variant="outline" onClick={() => clearQ.mutate()} disabled={clearQ.isPending}>
                <Trash2 className="h-4 w-4" /> {t("dash.clearQueue")}
              </Button>
              <Button variant="outline" onClick={() => clearL.mutate()} disabled={clearL.isPending}>
                <Trash2 className="h-4 w-4" /> {t("dash.clearLogs")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("dash.padHint")}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-primary" />
              {t("dash.liveLogs")}
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/logs">{t("dash.viewAll")}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-72 overflow-auto rounded-md border bg-muted/30 font-mono text-xs">
              {recentLogs.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  {t("logs.waiting")}
                </div>
              ) : (
                <div className="divide-y">
                  {recentLogs.map((l) => (
                    <div
                      key={l.id}
                      className="grid grid-cols-[auto_auto_auto_1fr] gap-2 px-3 py-1"
                    >
                      <span className="text-muted-foreground">{shortTs(l.ts)}</span>
                      <span className={cn("font-semibold", levelColor(l.level))}>{l.level}</span>
                      <span className="text-primary">{l.pad ?? "-"}</span>
                      <span className="whitespace-pre-wrap break-words">{l.message}</span>
                    </div>
                  ))}
                  <div ref={logsBottom} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              {t("dash.quickAdd")}
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/emails">{t("dash.viewAll")}</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder={t("dash.quickAddPh")}
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              rows={6}
              className="font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => addM.mutate()}
                disabled={!quickText.trim() || addM.isPending}
                size="sm"
              >
                {addM.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {t("emails.add")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => sheetM.mutate()}
                disabled={sheetM.isPending}
              >
                {sheetM.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudDownload className="h-4 w-4" />
                )}
                {t("dash.loadSheet")}
              </Button>
            </div>
            <div className="rounded-md border p-3 text-xs">
              <div className="mb-1 text-muted-foreground">{t("emails.queue")}</div>
              <div className="text-2xl font-semibold tabular-nums">
                {num(stats.queue_size ?? stats.pending)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("dash.recent")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col.email")}</TableHead>
                  <TableHead>{t("col.status")}</TableHead>
                  <TableHead>{t("col.pad")}</TableHead>
                  <TableHead>{t("col.updated")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      {t("dash.noJobs")}
                    </TableCell>
                  </TableRow>
                ) : (
                  jobs.slice(0, 25).map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-mono text-xs">{j.email}</TableCell>
                      <TableCell><StatusBadge s={j.status} /></TableCell>
                      <TableCell className="font-mono text-xs">{j.pad_code ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{j.updated_at ?? j.created_at ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function num(v: unknown) {
  return typeof v === "number" ? v : 0;
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

function StatusBadge({ s }: { s: string }) {
  const low = (s ?? "").toLowerCase();
  const cls = low.includes("success")
    ? "bg-emerald-100 text-emerald-700"
    : low.includes("fail") || low.includes("error")
      ? "bg-rose-100 text-rose-700"
      : low.includes("run")
        ? "bg-sky-100 text-sky-700"
        : "bg-muted text-muted-foreground";
  return <Badge variant="secondary" className={cls}>{s ?? "—"}</Badge>;
}
