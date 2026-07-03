# enowxwatcher

A cross-platform **menu-bar / system-tray** app that monitors all your VPSes over
SSH — built with **Tauri 2 + Rust** and a React + Tailwind frontend.

Click the tray icon for a compact status dropdown; open the full window for a
live dashboard. Add a server by pasting one command onto it. Get alerts on
Discord / Slack / any webhook when something goes down or runs hot.

> No agent to install on the VPS, no backend service, no vendor lock-in. Just
> SSH. Tailscale works too — a "host" is any IP you can reach.

## Features

- 🖥️ **Tray + window** — quick dropdown of every VPS's status, plus a full
  responsive dashboard (CPU / MEM rings, disk, network, load, uptime, CPU
  sparklines).
- ⚡ **Live over SSH** — a Rust background poller runs one command per host in
  parallel, so a slow/dead server never blocks the rest.
- 🔌 **Plug-and-play add** — run a one-line installer on the VPS; it creates a
  locked-down `enowx-monitor` user, authorizes the app's key (restricted to a
  single read-only command), and hands back a deep link the app auto-fills.
- 🔐 **Secure by design** — the app generates its own Ed25519 keypair stored in
  the OS keyring (Keychain / Credential Manager / Secret Service). The private
  key never touches disk; the VPS key can only run the metric script (no shell,
  no PTY).
- 🔔 **Webhook alerts** — Discord, Slack, or generic JSON. Trigger on offline,
  recovery, or CPU/MEM/disk/load thresholds. Edge-triggered with a cooldown so
  you're not spammed.
- 🚀 **Auto-start at login**, close-to-tray, light/dark theme.
- 🖱️ **One codebase, three OSes** — macOS, Windows, Linux (CI builds installers
  for all three).

## Tech

- **Tauri 2** (Rust core + webview) — tiny bundle, native tray.
- **Rust**: `russh` (pure-Rust SSH, no system OpenSSH), `tokio`, `keyring`,
  `reqwest`.
- **Frontend**: React + TypeScript + Tailwind, shadcn-style components + lucide
  icons.

## Develop

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

Produces `.dmg`/`.app` (macOS), `.msi`/`.exe` (Windows), `.AppImage`/`.deb`
(Linux). CI (`.github/workflows/build.yml`) builds all three on a `v*` tag.

## Add a VPS

**Via installer (recommended):** In the app, open **Add VPS → Via script** and
run the shown command on your server:

```bash
curl -fsSL https://raw.githubusercontent.com/enowdev/enowxwatcher/main/install.sh | sudo sh -s -- "<app-public-key>"
```

It prints an `enowxwatcher://add?...` link — the app fills in the form and
verifies the connection.

**Manually:** enter host, port, and user (key or password auth).

### What the installer does

- Creates `enowx-monitor` (locked password, no interactive login).
- Installs a read-only `enowx-metrics.sh` and authorizes the app's key with
  `command="…",no-pty,no-port-forwarding` — the key can *only* fetch metrics.

## Security notes

- The app's SSH private key lives in the OS keyring, never in a plaintext file.
- The monitoring key on each VPS is pinned to one command with no shell/PTY, so
  even though this app is open source, a copy of the public key grants nothing
  but read-only metrics.
- macOS/Windows builds are unsigned in v1 — allow the app in
  System Settings → Privacy & Security on first launch. (Notarization/signing is
  a future step.)

## License

MIT
