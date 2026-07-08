import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n";
import { getPads } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { PadRtcView } from "@/components/pad-rtc-view";

export const Route = createFileRoute("/viewer")({
  head: () => ({
    meta: [
      { title: "Màn hình thiết bị · VMOS Changer" },
      {
        name: "description",
        content: "Xem trực tiếp các thiết bị VMOS trong một lưới linh hoạt.",
      },
    ],
  }),
  component: ViewerPage,
});

const COL_OPTIONS = [1, 2, 3, 4, 5, 6];
const ROW_OPTIONS = [1, 2, 3, 4];

function ViewerPage() {
  const t = useT();
  const workers = useAppStore((s) => s.workers);
  const logs = useAppStore((s) => s.logs);
  const wsStatus = useAppStore((s) => s.wsStatus);

  const padsQuery = useQuery({ queryKey: ["pads"], queryFn: getPads });

  const [cols, setCols] = useState(5);
  const [rows, setRows] = useState(2);

  const devices = useMemo(() => {
    const workerPads = Object.keys(workers);
    const fetched = padsQuery.data?.pads ?? [];
    const merged = Array.from(new Set([...workerPads, ...fetched]));
    if (merged.length > 0) return merged;
    // Fallback demo devices khi backend chưa sẵn sàng — để xem trước layout
    return Array.from({ length: 8 }, (_, i) => `ACP2510148${String(i + 1).padStart(2, "0")}CT05Z`);
  }, [workers, padsQuery.data]);

  const capacity = cols * rows;
  const visible = devices.slice(0, capacity);

  const colClass: Record<number, string> = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    5: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
    6: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6",
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t("viewer.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("viewer.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("viewer.cols")}</span>
            <Select value={String(cols)} onValueChange={(v) => setCols(Number(v))}>
              <SelectTrigger className="h-9 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COL_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("viewer.rows")}</span>
            <Select value={String(rows)} onValueChange={(v) => setRows(Number(v))}>
              <SelectTrigger className="h-9 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROW_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => padsQuery.refetch()}
            disabled={padsQuery.isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${padsQuery.isFetching ? "animate-spin" : ""}`} />
            {t("viewer.reload")}
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {t("viewer.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className={`grid auto-rows-fr gap-4 ${colClass[cols]}`}>
          {visible.map((pad) => (
            <DeviceCell
              key={pad}
              pad={pad}
              online={wsStatus === "connected"}
              email={workers[pad]?.email}
              lastLog={
                [...logs].reverse().find((l) => l.pad === pad)?.message ??
                undefined
              }
            />
          ))}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">{t("viewer.hint")}</p>
    </div>
  );
}

function DeviceCell({
  pad,
  online,
  email,
  lastLog,
}: {
  pad: string;
  online: boolean;
  email?: string;
  lastLog?: string;
}) {
  const t = useT();

  return (
    <Card className="flex h-full flex-col overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0 truncate font-mono text-xs font-medium" title={pad}>
          {pad}
        </div>
        <Badge
          variant="secondary"
          className={
            online
              ? "shrink-0 bg-emerald-100 text-emerald-700"
              : "shrink-0 bg-muted text-muted-foreground"
          }
        >
          {online ? t("viewer.connected") : t("viewer.offline")}
        </Badge>
      </div>
      <div className="relative w-full bg-black" style={{ aspectRatio: "9 / 16" }}>
        <PadRtcView padCode={pad} />
      </div>
      <div className="min-h-[44px] border-t bg-muted/30 px-3 py-2 text-xs">
        {email ? (
          <div className="truncate font-medium" title={email}>
            {email}
          </div>
        ) : null}
        <div className="truncate text-muted-foreground" title={lastLog}>
          {lastLog ?? t("viewer.noLog")}
        </div>
      </div>
    </Card>
  );
}