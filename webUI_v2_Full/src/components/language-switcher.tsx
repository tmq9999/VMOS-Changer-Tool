import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="flex items-center gap-1.5">
      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
      <Select value={lang} onValueChange={(v) => setLang(v as "vi" | "en")}>
        <SelectTrigger className="h-8 w-[130px] text-xs" aria-label={t("lang.label")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="vi">{t("lang.vi")}</SelectItem>
          <SelectItem value="en">{t("lang.en")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}