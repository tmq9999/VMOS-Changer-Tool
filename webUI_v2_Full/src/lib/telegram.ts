const KEY = "vmos.telegram";

export interface TelegramConfig {
  bot_token: string;
  chat_id: string;
  thread_id: string;
  enabled?: boolean;
}

export function getTelegramConfig(): TelegramConfig {
  if (typeof window === "undefined") return { bot_token: "", chat_id: "", thread_id: "", enabled: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { bot_token: "", chat_id: "", thread_id: "", enabled: false };
    const p = JSON.parse(raw) as Partial<TelegramConfig>;
    return {
      bot_token: p.bot_token ?? "",
      chat_id: p.chat_id ?? "",
      thread_id: p.thread_id ?? "",
      enabled: p.enabled ?? false,
    };
  } catch {
    return { bot_token: "", chat_id: "", thread_id: "", enabled: false };
  }
}

export function setTelegramConfig(cfg: TelegramConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(cfg));
  window.dispatchEvent(new CustomEvent("vmos:telegram-change"));
}

export function isTelegramEnabled(): boolean {
  return getTelegramConfig().enabled === true;
}

export function setTelegramEnabled(enabled: boolean): void {
  const cfg = getTelegramConfig();
  cfg.enabled = enabled;
  setTelegramConfig(cfg);
}

export async function sendTelegramMessage(cfg: TelegramConfig, text: string): Promise<void> {
  if (!cfg.bot_token || !cfg.chat_id) {
    throw new Error("Missing bot token or chat id");
  }
  const body: Record<string, unknown> = {
    chat_id: cfg.chat_id,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (cfg.thread_id && cfg.thread_id.trim()) {
    const n = Number(cfg.thread_id);
    if (Number.isFinite(n)) body.message_thread_id = n;
  }
  const res = await fetch(`https://api.telegram.org/bot${cfg.bot_token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
  };
  if (!res.ok || !json.ok) {
    throw new Error(json.description || `Telegram API ${res.status}`);
  }
}

/**
 * Send a Telegram notification only when the user has enabled Telegram
 * notifications on the dashboard. Use this for event-driven messages;
 * use sendTelegramMessage directly for explicit test/save actions.
 */
export async function notifyTelegram(text: string): Promise<void> {
  const cfg = getTelegramConfig();
  if (!cfg.enabled) return;
  if (!cfg.bot_token || !cfg.chat_id) return;
  await sendTelegramMessage(cfg, text);
}