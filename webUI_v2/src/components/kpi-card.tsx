import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: "default" | "success" | "danger" | "info" | "warn";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-emerald-600",
    danger: "text-rose-600",
    info: "text-sky-600",
    warn: "text-amber-600",
  }[tone];
  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className={cn("mt-1 text-2xl font-semibold tabular-nums", toneClass)}>{value}</div>
        </div>
        {Icon ? <Icon className={cn("h-5 w-5 text-muted-foreground", toneClass)} /> : null}
      </CardContent>
    </Card>
  );
}