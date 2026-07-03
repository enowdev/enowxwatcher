#!/usr/bin/env sh
# enowxwatcher VPS installer.
#
# Creates a restricted `enowx-monitor` user that can only run the read-only
# metric command (no shell, no sudo), authorizes the app's SSH key for it, and
# prints a deep link to paste into the app.
#
# Usage (from the app's "Add via Script" screen — the pubkey is filled in):
#   curl -fsSL https://raw.githubusercontent.com/enowdev/enowxwatcher/main/install.sh | sudo sh -s -- "ssh-ed25519 AAAA... enowxwatcher"
set -eu

PUBKEY="${1:-}"
USERNAME="enowx-monitor"
HOME_DIR="/home/$USERNAME"

if [ -z "$PUBKEY" ]; then
  echo "error: missing app public key argument" >&2
  echo "usage: curl ... | sudo sh -s -- \"<ssh-ed25519 pubkey>\"" >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "error: run as root (use sudo)" >&2
  exit 1
fi

# 1) Create the user. It needs a real shell so the forced command can run, but
# the password is locked (no interactive login) and the SSH key is pinned to a
# single command with no PTY — so the shell is never usable interactively.
if ! id "$USERNAME" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/sh "$USERNAME"
  passwd -l "$USERNAME" >/dev/null 2>&1 || true
else
  # ensure an existing install-user has a usable shell for the forced command
  usermod --shell /bin/sh "$USERNAME" >/dev/null 2>&1 || true
fi
HOME_DIR="$(getent passwd "$USERNAME" | cut -d: -f6)"
[ -n "$HOME_DIR" ] || HOME_DIR="/home/$USERNAME"

# 2) Install the metric script the key is restricted to.
SCRIPT="/usr/local/bin/enowx-metrics.sh"
cat > "$SCRIPT" <<'METRIC'
#!/bin/sh
cat /proc/stat | grep '^cpu ' | sed 's/^/CPU1 /'
cat /proc/net/dev | grep -v -E 'lo:|face' | awk '{rx+=$2; tx+=$10} END{print "NET1", rx, tx}'
sleep 1
cat /proc/stat | grep '^cpu ' | sed 's/^/CPU2 /'
cat /proc/net/dev | grep -v -E 'lo:|face' | awk '{rx+=$2; tx+=$10} END{print "NET2", rx, tx}'
grep -E 'MemTotal|MemAvailable' /proc/meminfo | sed 's/^/MEM /'
df -k --output=size,used / | tail -1 | sed 's/^/DISK /'
cat /proc/uptime | sed 's/^/UP /'
cat /proc/loadavg | sed 's/^/LOAD /'
METRIC
chmod 0555 "$SCRIPT"

# 3) Authorize the app key, restricted to only run the metric script.
SSH_DIR="$HOME_DIR/.ssh"
mkdir -p "$SSH_DIR"
AUTH="$SSH_DIR/authorized_keys"
RESTRICT="command=\"$SCRIPT\",no-agent-forwarding,no-port-forwarding,no-pty,no-X11-forwarding,no-user-rc"
LINE="$RESTRICT $PUBKEY"
# Idempotent: drop any prior enowxwatcher line, then add.
touch "$AUTH"
grep -v "enowxwatcher" "$AUTH" > "$AUTH.tmp" 2>/dev/null || true
mv "$AUTH.tmp" "$AUTH" 2>/dev/null || true
echo "$LINE" >> "$AUTH"
chown -R "$USERNAME":"$USERNAME" "$SSH_DIR"
chmod 700 "$SSH_DIR"
chmod 600 "$AUTH"

# 4) Detect the public IP (best effort; user can edit in the app).
IP="$(curl -fsSL --max-time 5 https://api.ipify.org 2>/dev/null || true)"
[ -n "$IP" ] || IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$IP" ] || IP="YOUR_VPS_IP"
NAME="$(hostname 2>/dev/null || echo vps)"

echo ""
echo "✅ enowxwatcher is ready on this VPS."
echo "   user: $USERNAME (restricted, read-only metrics)"
echo "   host: $IP   port: 22"
echo ""
echo "→ Paste this into the app (Add via Script → Paste connection):"
echo ""
echo "enowxwatcher://add?host=$IP&user=$USERNAME&port=22&name=$NAME"
echo ""
