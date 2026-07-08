import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSettings, saveSettings } from "@/lib/api";
import type { AppSettings } from "@/lib/api";
import { getBackendBase, setBackendBase } from "@/lib/api-config";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · VMOS Changer" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const [form, setForm] = useState<Partial<AppSettings>>({});
  const [backendBase, setBackendBaseState] = useState("");
  const t = useT();

  useEffect(() => {
    if (q.data) setForm(q.data);
  }, [q.data]);
  useEffect(() => {
    setBackendBaseState(getBackendBase());
  }, []);

  const saveM = useMutation({
    mutationFn: () => saveSettings(form),
    onSuccess: () => {
      toast.success(t("set.saved"));
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const testConn = async () => {
    try {
      await getSettings();
      toast.success(t("set.backend.reachable"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("set.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("set.subtitle")}</p>
        </div>
        <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
          {saveM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("set.save")}
        </Button>
      </div>

      <Tabs defaultValue="backend">
        <TabsList>
          <TabsTrigger value="backend">{t("set.tab.backend")}</TabsTrigger>
          <TabsTrigger value="vmos">{t("set.tab.vmos")}</TabsTrigger>
          <TabsTrigger value="sheet">{t("set.tab.sheet")}</TabsTrigger>
          <TabsTrigger value="timing">{t("set.tab.timing")}</TabsTrigger>
          <TabsTrigger value="viewer">{t("set.tab.viewer")}</TabsTrigger>
        </TabsList>

        <TabsContent value="backend">
          <Card>
            <CardHeader><CardTitle>{t("set.backend.title")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>{t("set.backend.url")}</Label>
                <Input
                  placeholder="http://localhost:8000"
                  value={backendBase}
                  onChange={(e) => setBackendBaseState(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t("set.backend.hint")}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setBackendBase(backendBase);
                    toast.success(t("set.backend.saved"));
                    setTimeout(() => window.location.reload(), 400);
                  }}
                >
                  {t("set.backend.saveReload")}
                </Button>
                <Button variant="ghost" onClick={testConn}>{t("set.backend.test")}</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vmos">
          <Card>
            <CardHeader><CardTitle>{t("set.vmos.title")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label={t("set.vmos.access")}>
                <Input value={form.access_key ?? ""} onChange={(e) => set("access_key", e.target.value)} />
              </Field>
              <Field label={`${t("set.vmos.secret")} ${form.has_secret_key ? t("set.vmos.secretConfigured") : ""}`}>
                <Input
                  type="password"
                  placeholder={form.has_secret_key ? t("set.vmos.secretPh") : ""}
                  value={(form.secret_key as string) ?? ""}
                  onChange={(e) => set("secret_key", e.target.value)}
                />
              </Field>
              <Field label={t("set.vmos.padMode")}>
                <Select
                  value={form.pad_mode ?? "auto"}
                  onValueChange={(v) => set("pad_mode", v as "auto" | "manual")}
                >
                  <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t("set.vmos.padAuto")}</SelectItem>
                    <SelectItem value="manual">{t("set.vmos.padManual")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("set.vmos.manualList")}>
                <Textarea
                  rows={4}
                  className="font-mono text-xs"
                  value={(form.manual_pad_codes ?? []).join("\n")}
                  onChange={(e) =>
                    set(
                      "manual_pad_codes",
                      e.target.value
                        .split(/[\n,]/)
                        .map((x) => x.trim())
                        .filter(Boolean),
                    )
                  }
                />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sheet">
          <Card>
            <CardHeader><CardTitle>{t("set.sheet.title")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label={t("set.sheet.saJson")}>
                <Textarea
                  rows={8}
                  className="font-mono text-xs"
                  value={form.service_account_json ?? ""}
                  onChange={(e) => set("service_account_json", e.target.value)}
                />
              </Field>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label={t("set.sheet.id")}>
                  <Input value={form.spreadsheet_id ?? ""} onChange={(e) => set("spreadsheet_id", e.target.value)} />
                </Field>
                <Field label={t("set.sheet.name")}>
                  <Input value={form.sheet_name ?? ""} onChange={(e) => set("sheet_name", e.target.value)} />
                </Field>
                <Field label={t("set.sheet.startRow")}>
                  <Input
                    type="number"
                    value={form.data_start_row ?? 2}
                    onChange={(e) => set("data_start_row", Number(e.target.value))}
                  />
                </Field>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.skip_successful ?? true}
                  onCheckedChange={(v) => set("skip_successful", v)}
                />
                <Label>{t("set.sheet.skip")}</Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timing">
          <Card>
            <CardHeader><CardTitle>{t("set.timing.title")}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <NumField label={t("set.timing.poll")} k="poll_interval" form={form} set={set} step={0.5} />
                <NumField label={t("set.timing.step")} k="step_timeout" form={form} set={set} />
                <NumField label={t("set.timing.magisk")} k="magisk_timeout" form={form} set={set} />
                <NumField label={t("set.timing.retry")} k="retry_count" form={form} set={set} />
                <NumField label={t("set.timing.startDelay")} k="worker_start_delay" form={form} set={set} step={0.5} />
                <NumField label={t("set.timing.stepDelay")} k="step_delay" form={form} set={set} step={0.5} />
                <NumField label={t("set.timing.settle")} k="post_boot_settle" form={form} set={set} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="viewer">
          <Card>
            <CardHeader><CardTitle>{t("set.viewer.title")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <NumField label={t("set.viewer.rows")} k="viewer_rows" form={form} set={set} />
                <NumField label={t("set.viewer.cols")} k="viewer_cols" form={form} set={set} />
              </div>
              <Field label={t("set.viewer.baseUrl")}>
                <Input
                  value={form.h5_base_url ?? ""}
                  onChange={(e) => set("h5_base_url", e.target.value)}
                  placeholder="https://openapi-hk.armcloud.net"
                />
                <p className="text-xs text-muted-foreground">{t("set.viewer.baseUrlHint")}</p>
              </Field>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function NumField({
  label,
  k,
  form,
  set,
  step = 1,
}: {
  label: string;
  k: keyof AppSettings;
  form: Partial<AppSettings>;
  set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;
  step?: number;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        step={step}
        value={(form[k] as number | undefined) ?? 0}
        onChange={(e) => set(k, Number(e.target.value) as AppSettings[typeof k])}
      />
    </Field>
  );
}