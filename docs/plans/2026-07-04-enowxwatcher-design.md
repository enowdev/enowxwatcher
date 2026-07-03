# enowxwatcher — Cross-platform VPS monitor (Design)

**Date:** 2026-07-04
**Status:** Validated design — ready for implementation planning
**Repo:** `enowdev/enowxwatcher` (public, portfolio)

## Summary

A cross-platform **menu-bar / system-tray** desktop app (Tauri 2 + Rust) that
monitors many VPSes over **SSH**. Standalone and open-source — no private
backend, no mandatory dependencies (Tailscale is optional; any host reachable
over SSH works). Clicking the tray icon shows a compact dropdown with every
VPS's status; an **Open App** button opens a full dashboard window. Auto-starts
at login and runs quietly in the tray.

## Goals / constraints

- **Portfolio-grade**: clean standalone repo, good README, CI that builds
  installers for macOS + Windows + Linux.
- **No private infra**: does not touch enowxlabs or any personal backend.
- **SSH-based, Tailscale-agnostic**: a "host" is just an IP (public or tailnet).
- **Secure**: app generates its own Ed25519 keypair; the private key lives in the
  OS keyring and never touches disk in plaintext.
- **Cross-platform code, tested on macOS**: Windows/Linux are written correctly
  and built in CI, but runtime-tested by others (no Win/Linux dev access).
- **Reusable components**: shadcn-style UI kit + lucide icons.

## Stack

- **Tauri 2** — Rust core + webview frontend; tiny bundle, native tray, multi-OS.
- **Rust core**: `russh` (pure-Rust SSH, no system OpenSSH needed), `tokio`
  (async poller), `keyring` (cross-platform secret storage), `reqwest`
  (webhooks), `serde`.
- **Frontend**: React + TypeScript + Tailwind, shadcn-style components + lucide
  icons. Responsive.
- **Plugins**: `tauri-plugin-autostart` (login start, all OSes),
  `tauri-plugin-positioner` (popover placement).

## Architecture

```
┌─────────────────────── Tauri App ───────────────────────┐
│  RUST CORE (backend)              WEBVIEW (frontend)      │
│  ┌─────────────────┐              ┌──────────────────┐    │
│  │ SSH Poller      │  ──emit──▶   │ React+TS+Tailwind │    │
│  │ (russh, tokio)  │   events     │ shadcn + lucide   │    │
│  ├─────────────────┤              │  Tray dropdown    │    │
│  │ Metric parser   │  ◀─invoke──  │  Main window      │    │
│  ├─────────────────┤   commands   └──────────────────┘    │
│  │ Keyring (key)   │                                       │
│  │ Config store    │                                       │
│  │ Webhook sender  │                                       │
│  └────────┬────────┘                                       │
└───────────┼───────────────────────────────────────────────┘
            │ SSH (per VPS, pooled)
       ┌────▼────┬─────────┬─────────┐
     VPS-1     VPS-2     VPS-3   (public IP or tailnet IP)
```

**Data flow:**
1. **Poller** (Rust background task): every ~10–30s (configurable) SSHes each VPS
   and runs ONE combined command reading `/proc/stat`, `/proc/meminfo`, `df`,
   `uptime`, `/proc/net/dev`; parses into `VpsMetrics`. Polls run in parallel
   with a per-VPS timeout so one dead host doesn't block the rest. SSH
   connections are pooled/reused between polls.
2. Rust **emits** a `metrics-updated` event → frontend renders reactively (tray
   and window stay in sync).
3. Frontend calls **commands** via `invoke`: `add_vps`, `remove_vps`,
   `list_vps`, `test_connection`, `get_metrics`, `set_webhook`, etc.
4. **Webhook sender**: after each metric update, evaluates rules and POSTs to
   Discord/Slack/generic webhooks on state changes.

Polling lives in Rust (not the frontend) so it keeps running with the window
closed and is fast/safe; the frontend only renders.

## Data model & storage

```rust
struct Vps { id, name, host, port, user, auth: AuthMethod, tags: Vec<String>, added_at }
enum AuthMethod { Key, Password }   // Key is default
struct VpsMetrics {
    vps_id, online: bool, cpu_pct: f32,
    mem_used_mb, mem_total_mb, disk_used_gb, disk_total_gb,
    net_rx_kbps, net_tx_kbps, load: [f32;3], uptime_secs,
    last_checked, error: Option<String>,
}
struct WebhookRule {
    id, url, kind: WebhookKind /* Discord|Slack|Generic */,
    triggers: Vec<Trigger>, enabled: bool, cooldown_secs,
}
enum Trigger { Offline, Online, CpuAbove(f32), MemAbove(f32), DiskAbove(f32), LoadAbove(f32) }
```

**Storage (by sensitivity):**
1. **Config** (`vps.json` in the app config dir) — VPS list, tags, poll interval,
   webhook rules. No secrets.
2. **SSH private key** → OS keyring via `keyring` crate (macOS Keychain / Windows
   Credential Manager / Linux Secret Service). Generated once (Ed25519); never
   written to disk in plaintext.
3. **VPS password** (only if user picks password auth) → keyring too.
4. **Metric history**: in-memory ring buffer (~60 points/VPS) for sparklines. Not
   persisted in v1 (restart resets). SQLite can be added later for long history.

## Add a VPS

**A. Manual**: form (name, host, port, user, auth, tags) → **Test Connection**
(one SSH probe) → save on success.

**B. Installer script (plug-and-play)** for fresh VPSes:
1. App shows a one-liner with the app's public key embedded:
   `curl -fsSL https://raw.githubusercontent.com/enowdev/enowxwatcher/main/install.sh | sudo sh -s -- "<app-ed25519-pubkey>"`
2. Run it on the VPS. `install.sh`:
   - creates a restricted `enowx-monitor` user (no login shell, no sudo),
   - writes the app public key to its `authorized_keys` with a `command="..."`
     restriction (key may only run the metric script — safe even though the app
     is open-source),
   - prints connection info + a deep link:
     `enowxwatcher://add?host=<auto-ip>&user=enowx-monitor&port=22`
3. Paste the deep link into the app (or click it) → app verifies + adds the VPS.

No backend/service — "auto-connect" = 1 command + 1 paste.

## UI

**Tray icon** (dynamic status: calm when all online; red/badge when any
offline/alert; can show a compact summary like avg CPU).

**Tray dropdown** (compact popover ~320px): per-VPS status dot + name + inline
CPU/MEM + ping; buttons **Add VPS**, **Open App**, settings gear, refresh. Live
updates from Rust events.

**Main window** (responsive dashboard):
- Sidebar: VPS list grouped by tag; Add, Settings, Webhooks.
- Responsive card grid (1–3 cols by width): each `VpsCard` shows CPU/MEM rings,
  disk bar, uptime, CPU sparkline, net rx/tx, load avg (lucide `Cpu`,
  `MemoryStick`, `HardDrive`, `Activity`, `Wifi`).
- Detail view (click a card): full metrics + larger charts + future actions.
- Settings: poll interval, theme (follows OS light/dark), autostart toggle,
  webhooks.

**Reusable components** (`components/ui/` shadcn + `components/monitor/`):
`StatRing`, `MetricBar`, `Sparkline`, `VpsCard`, `StatusDot`, plus Card/Button/
Input/Select/Switch/Badge/Dialog/Tabs.

## Webhooks & alerting

Rules evaluated each poll in Rust. Triggers: Offline, Online (recovery),
CpuAbove(n), MemAbove(n), DiskAbove(n), LoadAbove(n). Targets: Discord (pretty
embed, color by severity), Slack (blocks), Generic JSON (raw POST for
Telegram/n8n/etc).

**Anti-spam**: fire on **state change** only (not every poll while a condition
persists) + per-rule **cooldown**; automatic recovery notifications
(offline→online). UI: Webhooks tab lists rules with enable toggles; add/edit URL,
kind, target VPS (or all), triggers + thresholds (sliders), cooldown; a **Test**
button sends a dummy notification.

## Auto-start, multi-platform, packaging

- **Autostart** via `tauri-plugin-autostart`: macOS LaunchAgent, Windows Registry
  Run key, Linux `.desktop` autostart — handled by the plugin. Toggle in
  Settings. App starts straight to tray (no window).
- **Tray behavior**: cross-platform Tauri tray; positioner for popover placement
  (adjusted per OS). Main window: `skipTaskbar` + hide-on-close (closing returns
  to tray; real quit only from the tray menu).
- **Secrets**: `keyring` crate abstracts macOS/Windows/Linux secret stores;
  encrypted-file fallback if none is available.
- **SSH**: `russh` (pure Rust) — no system OpenSSH dependency on any OS.
- **Packaging**: macOS `.dmg`/`.app` (universal), Windows `.msi`/NSIS `.exe`,
  Linux `.AppImage`/`.deb`. Unsigned for v1 (README notes how to allow); notarize
  later if needed.
- **CI** (GitHub Actions): matrix build producing installers for all three OSes
  on release.

## Repo structure

```
enowxwatcher/
├── src-tauri/src/{main,ssh,metrics,poller,store,webhook,commands}.rs
├── src/{components/ui,components/monitor,views/Tray.tsx,views/App.tsx,lib}
├── install.sh
├── README.md            # portfolio docs + screenshots/GIF
└── .github/workflows/   # multi-OS build
```

## Out of scope (v1) / future

- Remote actions (restart service, reboot, run command) — read-only v1.
- Long-term metric history (SQLite) + big charts.
- Mobile / web version.
- Code signing / notarization for wide distribution.

## Open items before implementation

- Confirm the GitHub repo name/owner for the `install.sh` raw URL.
- Decide default poll interval (proposed 15s).
- Pick the tray icon art (will generate a set).
