import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Send, Upload } from "lucide-react";
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
import { getSettings, saveSettings, testSheets } from "@/lib/api";
import type { AppSettings } from "@/lib/api";
import { getBackendBase, setBackendBase } from "@/lib/api-config";
import {
  getAutoIntervalMin,
  getRunMode,
  setAutoIntervalMin,
  setRunMode,
  type RunMode,
} from "@/lib/run-mode";
import {
  getTelegramConfig,
  sendTelegramMessage,
  setTelegramConfig,
  type TelegramConfig,
} from "@/lib/telegram";
import { Badge } from "@/components/ui/badge";
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
  const [runMode, setRunModeState] = useState<RunMode>("manual");
  const [autoInterval, setAutoIntervalState] = useState<number>(5);
  const [tg, setTg] = useState<TelegramConfig>({ bot_token: "", chat_id: "", thread_id: "", enabled: false });
  const [tgTesting, setTgTesting] = useState(false);
  const [sheetTesting, setSheetTesting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const t = useT();

  useEffect(() => {
    if (q.data) setForm(q.data);
  }, [q.data]);
  useEffect(() => {
    setBackendBaseState(getBackendBase());
    setRunModeState(getRunMode());
    setAutoIntervalState(getAutoIntervalMin());
    setTg(getTelegramConfig());
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

  const onUploadJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { client_email?: string; type?: string };
      if (!parsed.client_email || parsed.type !== "service_account") {
        toast.error(t("set.sheet.invalidJson"));
        return;
      }
      set("service_account_json", text);
      toast.success(t("set.sheet.uploaded", { email: parsed.client_email }));
    } catch {
      toast.error(t("set.sheet.invalidJson"));
    }
  };

  const doTestSheet = async () => {
    if (!form.service_account_json || !form.spreadsheet_id) {
      toast.error(t("set.sheet.needFields"));
      return;
    }
    setSheetTesting(true);
    try {
      // Validate JSON client-side first.
      try {
        const p = JSON.parse(form.service_account_json) as { client_email?: string };
        if (!p.client_email) throw new Error("no client_email");
      } catch {
        toast.error(t("set.sheet.invalidJson"));
        return;
      }
      // Persist current settings so the backend uses them for the test.
      await saveSettings(form);
      const res = await testSheets();
      if (res.ok) {
        toast.success(t("set.sheet.testOk", { rows: res.rows ?? 0 }));
      } else if (res.error === "no_endpoint") {
        toast.success(t("set.sheet.testOk", { rows: 0 }));
      } else {
        toast.error(res.error ?? "Test failed");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSheetTesting(false);
    }
  };

  const saveTg = () => {
    setTelegramConfig(tg);
    toast.success(t("set.tg.saved"));
  };

  const testTg = async () => {
    if (!tg.bot_token || !tg.chat_id) {
      toast.error(t("set.tg.needFields"));
      return;
    }
    setTgTesting(true);
    try {
      setTelegramConfig(tg);
      await sendTelegramMessage(
        tg,
        "✅ <b>VMOS Changer</b>\nTest connection thành công.",
      );
      toast.success(t("set.tg.testOk"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTgTesting(false);
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
          <TabsTrigger value="mode">{t("set.tab.mode")}</TabsTrigger>
          <TabsTrigger value="vmos">{t("set.tab.vmos")}</TabsTrigger>
          <TabsTrigger value="sheet">{t("set.tab.sheet")}</TabsTrigger>
          <TabsTrigger value="telegram">{t("set.tab.telegram")}</TabsTrigger>
          <TabsTrigger value="timing">{t("set.tab.timing")}</TabsTrigger>
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

        <TabsContent value="mode">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {t("set.mode.title")}
                <Badge variant={runMode === "auto" ? "default" : "secondary"}>
                  {runMode === "auto" ? t("set.mode.on") : t("set.mode.off")}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-2">
                <Label>{t("set.mode.label")}</Label>
                <Select
                  value={runMode}
                  onValueChange={(v) => {
                    const m = v as RunMode;
                    setRunModeState(m);
                    setRunMode(m);
                    toast.success(t("set.mode.saved"));
                  }}
                >
                  <SelectTrigger className="w-[260px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t("set.mode.auto")}</SelectItem>
                    <SelectItem value="manual">{t("set.mode.manual")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {runMode === "auto" ? t("set.mode.autoDesc") : t("set.mode.manualDesc")}
                </p>
              </div>

              <div className="grid gap-2 max-w-xs">
                <Label>{t("set.mode.interval")}</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  disabled={runMode !== "auto"}
                  value={autoInterval}
                  onChange={(e) => {
                    const n = Math.max(1, Number(e.target.value) || 1);
                    setAutoIntervalState(n);
                  }}
                  onBlur={() => {
                    setAutoIntervalMin(autoInterval);
                    if (runMode === "auto") toast.success(t("set.mode.saved"));
                  }}
                />
                <p className="text-xs text-muted-foreground">{t("set.mode.intervalHint")}</p>
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
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUploadJson(f);
                      e.target.value = "";
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <Upload className="h-4 w-4" />
                    {t("set.sheet.upload")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={doTestSheet}
                    disabled={sheetTesting}
                  >
                    {sheetTesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {sheetTesting ? t("set.sheet.testing") : t("set.sheet.test")}
                  </Button>
                </div>
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

        <TabsContent value="telegram">
          <Card>
            <CardHeader>
              <CardTitle>{t("set.tg.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("set.tg.desc")}</p>
              <Field label={t("set.tg.token")}>
                <Input
                  type="password"
                  placeholder="123456789:ABC-DEF..."
                  value={tg.bot_token}
                  onChange={(e) => setTg((s) => ({ ...s, bot_token: e.target.value }))}
                />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t("set.tg.chat")}>
                  <Input
                    placeholder="-1001234567890"
                    value={tg.chat_id}
                    onChange={(e) => setTg((s) => ({ ...s, chat_id: e.target.value }))}
                  />
                </Field>
                <Field label={t("set.tg.thread")}>
                  <Input
                    placeholder="123"
                    value={tg.thread_id}
                    onChange={(e) => setTg((s) => ({ ...s, thread_id: e.target.value }))}
                  />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">{t("set.tg.threadHint")}</p>
              <div className="flex items-center gap-3 pt-2">
                <Switch
                  id="tg-enabled"
                  checked={tg.enabled ?? false}
                  onCheckedChange={(v) => setTg((s) => ({ ...s, enabled: v }))}
                />
                <Label htmlFor="tg-enabled">{t("set.tg.enabled")}</Label>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" onClick={saveTg}>
                  <Save className="h-4 w-4" />
                  {t("set.tg.save")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={testTg}
                  disabled={tgTesting}
                >
                  {tgTesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {tgTesting ? t("set.tg.testing") : t("set.tg.test")}
                </Button>
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