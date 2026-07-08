import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudDownload, ListChecks, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addEmails, getJobs, loadFromSheets, validateEmails } from "@/lib/api";
import type { AddResult, JobRow, ValidateResult } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/emails")({
  head: () => ({ meta: [{ title: "Emails · VMOS Changer" }] }),
  component: EmailsPage,
});

function EmailsPage() {
  const [text, setText] = useState("");
  const [validated, setValidated] = useState<ValidateResult | null>(null);
  const qc = useQueryClient();
  const lastSheet = useAppStore((s) => s.lastSheetLoad);
  const setLastSheet = useAppStore((s) => s.setLastSheetLoad);
  const t = useT();

  const jobsQ = useQuery({ queryKey: ["jobs"], queryFn: getJobs, refetchInterval: 5000 });
  const jobs: JobRow[] = Array.isArray(jobsQ.data)
    ? jobsQ.data
    : (jobsQ.data as { jobs?: JobRow[] })?.jobs ?? [];

  const validateM = useMutation({
    mutationFn: () => validateEmails(text),
    onSuccess: (r) => setValidated(r),
    onError: (e: Error) => toast.error(e.message),
  });

  const addM = useMutation({
    mutationFn: () => addEmails(text),
    onSuccess: (r: AddResult) => {
      toast.success(t("emails.toastAdded", { added: r.added, dup: r.skipped_duplicate, inv: r.invalid_count }));
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sheetM = useMutation({
    mutationFn: loadFromSheets,
    onSuccess: async (r) => {
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(t("emails.toastLoaded", { loaded: r.loaded, dup: r.skipped_duplicate, inv: r.skipped_invalid }));
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      // Snapshot: emails currently queued/active from /api/jobs, marked as added-in-this-load.
      const latest = await getJobs();
      const arr: JobRow[] = Array.isArray(latest)
        ? latest
        : (latest as { jobs?: JobRow[] })?.jobs ?? [];
      const withRow = arr
        .filter((j) => j.sheet_row != null)
        .slice(0, r.loaded + r.skipped_duplicate)
        .map((j) => ({
          email: j.email,
          sheet_row: j.sheet_row ?? undefined,
          status: j.status,
        }));
      setLastSheet({
        at: Date.now(),
        result: {
          loaded: r.loaded,
          skipped_duplicate: r.skipped_duplicate,
          skipped_invalid: r.skipped_invalid,
          queue_size: r.queue_size,
        },
        emails: withRow,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("emails.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("emails.subtitle")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("emails.bulk")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder={"email|password|2FA_SECRET\nemail2|password2|2FA_SECRET"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => validateM.mutate()} disabled={!text.trim() || validateM.isPending}>
                {validateM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
                {t("emails.validate")}
              </Button>
              <Button onClick={() => addM.mutate()} disabled={!text.trim() || addM.isPending}>
                {addM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t("emails.add")}
              </Button>
            </div>
            {validated ? (
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex gap-2 text-sm">
                  <Badge className="bg-emerald-100 text-emerald-700" variant="secondary">
                    {validated.valid_count} {t("emails.valid")}
                  </Badge>
                  <Badge className="bg-rose-100 text-rose-700" variant="secondary">
                    {validated.invalid_count} {t("emails.invalid")}
                  </Badge>
                </div>
                {validated.invalid.length > 0 && (
                  <ul className="max-h-40 overflow-auto text-xs text-rose-700">
                    {validated.invalid.map((v, i) => (
                      <li key={i} className="font-mono">
                        {t("emails.line")} {v.line}: {v.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("emails.sheet")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("emails.sheetDesc")}</p>
            <Button onClick={() => sheetM.mutate()} disabled={sheetM.isPending}>
              {sheetM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
              {t("emails.loadSheet")}
            </Button>
            {lastSheet ? (
              <div className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge className="bg-emerald-100 text-emerald-700" variant="secondary">
                    {t("emails.loaded")} {lastSheet.result.loaded}
                  </Badge>
                  <Badge variant="secondary">{t("emails.duplicate")} {lastSheet.result.skipped_duplicate}</Badge>
                  <Badge className="bg-rose-100 text-rose-700" variant="secondary">
                    {t("emails.invalid")} {lastSheet.result.skipped_invalid}
                  </Badge>
                  <Badge variant="outline">{t("emails.queue")} {lastSheet.result.queue_size}</Badge>
                </div>
                <div className="max-h-64 overflow-auto rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("col.row")}</TableHead>
                        <TableHead>{t("col.email")}</TableHead>
                        <TableHead>{t("col.status")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lastSheet.emails.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                            {t("emails.noRows")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        lastSheet.emails.map((e, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{e.sheet_row ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{e.email}</TableCell>
                            <TableCell className="text-xs">{e.status}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("emails.noSheetYet")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{t("emails.current")}</CardTitle>
          <Badge variant="outline">{jobs.length}</Badge>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col.email")}</TableHead>
                  <TableHead>{t("col.status")}</TableHead>
                  <TableHead>{t("col.pad")}</TableHead>
                  <TableHead>{t("col.sheetRow")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                      {t("emails.emptyQueue")}
                    </TableCell>
                  </TableRow>
                ) : (
                  jobs.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-mono text-xs">{j.email}</TableCell>
                      <TableCell className="text-xs">{j.status}</TableCell>
                      <TableCell className="font-mono text-xs">{j.pad_code ?? "—"}</TableCell>
                      <TableCell className="text-xs">{j.sheet_row ?? "—"}</TableCell>
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