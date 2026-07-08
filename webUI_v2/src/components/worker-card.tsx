import { Cpu, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { WorkerState } from "@/lib/store";
import { useT } from "@/lib/i18n";

function statusTone(status?: string) {
  const s = (status ?? "").toLowerCase();
  if (s.includes("success") || s === "done") return "bg-emerald-100 text-emerald-700";
  if (s.includes("fail") || s.includes("error")) return "bg-rose-100 text-rose-700";
  if (s.includes("run") || s.includes("processing")) return "bg-sky-100 text-sky-700";
  if (s.includes("idle")) return "bg-muted text-muted-foreground";
  return "bg-muted text-muted-foreground";
}

export function WorkerCard({ w }: { w: WorkerState }) {
  const progress = typeof w.progress === "number" ? Math.max(0, Math.min(100, w.progress)) : undefined;
  const t = useT();
  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <span className="font-mono text-sm font-medium">{w.pad_code}</span>
          </div>
          <Badge variant="secondary" className={statusTone(w.status)}>
            {w.status ?? "idle"}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {w.step ?? t("worker.waiting")}
        </div>
        {typeof progress === "number" ? <Progress value={progress} className="h-1.5" /> : null}
        <div className="flex items-center gap-2 text-xs">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate">{w.email ?? "—"}</span>
        </div>
      </CardContent>
    </Card>
  );
}