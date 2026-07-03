import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

// --- Types (mirror the Rust structs) ---

export type AuthKind = "key" | "password";

export interface Vps {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  auth: AuthKind;
  tags: string[];
  added_at: string;
}

export interface VpsMetrics {
  online: boolean;
  cpu_pct: number;
  mem_used_mb: number;
  mem_total_mb: number;
  disk_used_gb: number;
  disk_total_gb: number;
  net_rx_kbps: number;
  net_tx_kbps: number;
  load: [number, number, number];
  uptime_secs: number;
  error?: string;
}

export interface VpsStatus extends VpsMetrics {
  vps_id: string;
  cpu_history: number[];
  last_checked: string;
}

export type Trigger =
  | { type: "offline" }
  | { type: "online" }
  | { type: "cpuabove"; value: number }
  | { type: "memabove"; value: number }
  | { type: "diskabove"; value: number }
  | { type: "loadabove"; value: number };

export interface WebhookRule {
  id: string;
  url: string;
  kind: "discord" | "slack" | "generic";
  vps_id: string | null;
  triggers: Trigger[];
  enabled: boolean;
  cooldown_secs: number;
}

export interface Settings {
  poll_interval_secs: number;
}

export interface NewVps {
  name: string;
  host: string;
  port: number;
  user: string;
  auth: AuthKind;
  password?: string;
  tags: string[];
}

// --- Commands ---

export const api = {
  listVps: () => invoke<Vps[]>("list_vps"),
  getStatuses: () => invoke<VpsStatus[]>("get_statuses"),
  testConnection: (vps: NewVps) => invoke<VpsMetrics>("test_connection", { vps }),
  addVps: (vps: NewVps) => invoke<Vps>("add_vps", { vps }),
  removeVps: (id: string) => invoke<void>("remove_vps", { id }),
  getPublicKey: () => invoke<string>("get_public_key"),
  listWebhooks: () => invoke<WebhookRule[]>("list_webhooks"),
  setWebhooks: (hooks: WebhookRule[]) => invoke<void>("set_webhooks", { hooks }),
  testWebhook: (rule: WebhookRule) => invoke<void>("test_webhook", { rule }),
  getSettings: () => invoke<Settings>("get_settings"),
  setSettings: (settings: Settings) => invoke<void>("set_settings", { settings }),
  listProcesses: (vpsId: string) => invoke<Proc[]>("list_processes", { vpsId }),
  killProcess: (vpsId: string, pid: number, signal: "TERM" | "KILL") =>
    invoke<void>("kill_process", { vpsId, pid, signal }),
};

export interface Proc {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  command: string;
}

// --- Events ---

export function onMetrics(cb: (statuses: VpsStatus[]) => void): Promise<UnlistenFn> {
  return listen<VpsStatus[]>("metrics-updated", (e) => cb(e.payload));
}

export function onEnroll(cb: (fields: Record<string, string>) => void): Promise<UnlistenFn> {
  return listen<Record<string, string>>("enroll-vps", (e) => cb(e.payload));
}

// --- Window helpers ---

export async function openMainWindow() {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const main = await WebviewWindow.getByLabel("main");
  await main?.show();
  await main?.setFocus();
  // hide the tray popover
  try {
    await getCurrentWindow().hide();
  } catch {
    /* not the tray window */
  }
}
