import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { getPads } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "@/lib/i18n";

export function PadPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const q = useQuery({ queryKey: ["pads"], queryFn: getPads });
  const pads = q.data?.pads ?? [];
  const t = useT();

  const toggle = (p: string) => {
    onChange(selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {q.data?.source === "auto" ? t("pad.auto") : q.data?.source === "manual" ? t("pad.manual") : t("pad.list")}
          {q.data?.total != null ? ` · ${q.data.total} ${t("pad.available")}` : ""}
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(pads)}
            disabled={pads.length === 0}
          >
            {t("pad.selectAll")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onChange([])} disabled={selected.length === 0}>
            {t("pad.clear")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <ScrollArea className="h-40 rounded-md border p-2">
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("pad.loading")}
          </div>
        ) : q.error ? (
          <div className="text-sm text-rose-600">{t("pad.loadFail")}</div>
        ) : pads.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("pad.none")}</div>
        ) : (
          <div className="space-y-1">
            {pads.map((p) => (
              <label key={p} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted">
                <Checkbox
                  checked={selected.includes(p)}
                  onCheckedChange={() => toggle(p)}
                />
                <span className="font-mono text-xs">{p}</span>
              </label>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}