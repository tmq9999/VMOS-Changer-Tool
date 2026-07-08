import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PadCard } from "@/components/pad-card";
import { getPads, getSettings, getLogs } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";

const COL_OPTIONS = [1, 2, 3, 4, 5, 6];
const ROW_OPTIONS = [1, 2, 3, 4];

export const Route = createFileRoute("/viewer")({
  head: () => ({ meta: [{ title: "Viewer · VMOS Changer" }] }),
  component: ViewerPage,
});

function ViewerPage() {
  const t = useT();
  const seedLogs = useAppStore((s) => s.seedLogs);

  const padsQ = useQuery({ queryKey: ["pads"], queryFn: getPads });
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(1);
  const [page, setPage] = useState(0);

  // Initialise rows/cols from backend settings once loaded.
  const initedRef = useRef(false);
  useEffect(() => {
    if (initedRef.current || !settingsQ.data) return;
    initedRef.current = true;
    if (settingsQ.data.viewer_cols) setCols(settingsQ.data.viewer_cols);
    if (settingsQ.data.viewer_rows) setRows(settingsQ.data.viewer_rows);
  }, [settingsQ.data]);

  // Seed historical logs once so mini-log footers have content immediately.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    if (useAppStore.getState().logs.length > 0) return;
    getLogs(200)
      .then((r) => {
        if (!Array.isArray(r) || r.length === 0) return;
        seedLogs(
          [...r].reverse().map((x) => ({
            ts: x.created_at,
            level: x.level ?? "INFO",
            pad: x.pad_code ?? undefined,
            message: x.message ?? "",
          })),
        );
      })
      .catch(() => {});
  }, [seedLogs]);

  const pads = padsQ.data?.pads ?? [];
  const perPage = rows * cols;
  const totalPages = Math.max(1, Math.ceil(pads.length / perPage));
  const safePage = Math.min(page, totalPages - 1);
  const visiblePads = useMemo(
    () => pads.slice(safePage * perPage, safePage * perPage + perPage),
    [pads, safePage, perPage],
  );

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Header + controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("viewer.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("viewer.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs">{t("viewer.cols")}</Label>
            <Select value={String(cols)} onValueChange={(v) => setCols(Number(v))}>
              <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COL_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs">{t("viewer.rows")}</Label>
            <Select value={String(rows)} onValueChange={(v) => setRows(Number(v))}>
              <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROW_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={() => padsQ.refetch()}>
            <RefreshCw className="h-4 w-4" /> {t("viewer.refresh")}
          </Button>
        </div>
      </div>

      {/* Body */}
      {padsQ.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("viewer.loading")}
        </div>
      ) : pads.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          {t("viewer.noPads")}
        </div>
      ) : (
        <>
          <div
            className="grid min-h-0 flex-1 gap-3 overflow-auto"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(180px, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            }}
          >
            {visiblePads.map((pad) => (
              <PadCard key={pad} padCode={pad} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" /> {t("viewer.prev")}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t("viewer.pageOf", { page: safePage + 1, total: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                {t("viewer.next")} <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">{t("viewer.hint")}</p>
        </>
      )}
    </div>
  );
}
