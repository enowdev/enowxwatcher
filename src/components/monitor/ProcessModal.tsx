import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, Loader2, X, Skull, Ban } from "lucide-react";
import { api, type Proc, type Vps } from "../../lib/api.ts";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog.tsx";
import { Input } from "../ui/input.tsx";
import { Button } from "../ui/button.tsx";

// Per-VPS process manager, opened from a card. Compact table (no horizontal
// scroll); right-click a row for Terminate / Force-kill.
export function ProcessModal({
  vps,
  open,
  onOpenChange,
}: {
  vps: Vps;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [procs, setProcs] = useState<Proc[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [busyPid, setBusyPid] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; proc: Proc } | null>(null);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      setProcs(await api.listProcesses(vps.id));
    } catch (e) {
      setProcs([]);
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load();
    else {
      setQuery("");
      setProcs([]);
      setErr("");
      setMenu(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close the context menu on any outside click / escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  async function kill(pid: number, signal: "TERM" | "KILL") {
    setMenu(null);
    const verb = signal === "KILL" ? "Force-kill" : "Terminate";
    if (!confirm(`${verb} PID ${pid} on ${vps.name}?`)) return;
    setBusyPid(pid);
    try {
      await api.killProcess(vps.id, pid, signal);
      setProcs((p) => p.filter((x) => x.pid !== pid));
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusyPid(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return procs;
    return procs.filter(
      (p) => p.command.toLowerCase().includes(q) || p.user.toLowerCase().includes(q) || String(p.pid).includes(q),
    );
  }, [procs, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogTitle>
          Processes · <span className="text-muted-foreground">{vps.name}</span>
        </DialogTitle>

        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="pl-8"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        {err && (
          <div className="mt-3 rounded-md border border-destructive/40 p-3 text-xs text-destructive">
            {err}
            {err.includes("restricted") && (
              <p className="mt-1 text-muted-foreground">
                Needs an account that can run <code>ps</code>/<code>kill</code> — the installer's monitor user is
                metrics-only. Add this VPS with a fuller account (e.g. root).
              </p>
            )}
          </div>
        )}

        <p className="mt-2 text-[11px] text-muted-foreground">Click a row for actions, or right-click for a menu.</p>

        <div className="mt-1 max-h-[52vh] overflow-y-auto rounded-md border border-border">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr className="border-b border-border">
                <th className="w-16 px-2 py-2 font-medium">PID</th>
                <th className="w-14 px-2 py-2 text-right font-medium">CPU</th>
                <th className="w-14 px-2 py-2 text-right font-medium">MEM</th>
                <th className="px-2 py-2 font-medium">Command</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <ProcRow
                  key={p.pid}
                  proc={p}
                  selected={selectedPid === p.pid}
                  busy={busyPid === p.pid}
                  onClick={() => setSelectedPid((cur) => (cur === p.pid ? null : p.pid))}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, proc: p });
                  }}
                  onKill={kill}
                />
              ))}
              {loading && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && !err && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    {procs.length === 0 ? "No processes." : "No matches."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!loading && !err && (
          <p className="mt-2 text-[11px] text-muted-foreground">{filtered.length} processes · sorted by CPU</p>
        )}

        {/* Right-click context menu */}
        {menu && (
          <div
            className="fixed z-[200] min-w-[160px] overflow-hidden rounded-md border border-border bg-card p-1 shadow-xl"
            style={{ left: menu.x, top: menu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="truncate px-2 py-1 text-[11px] text-muted-foreground">
              PID {menu.proc.pid} · {menu.proc.command.split(" ")[0].split("/").pop()}
            </div>
            <button
              onClick={() => kill(menu.proc.pid, "TERM")}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-warning/15 hover:text-warning"
            >
              <Ban className="h-3.5 w-3.5" /> Terminate (SIGTERM)
            </button>
            <button
              onClick={() => kill(menu.proc.pid, "KILL")}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-destructive/15 hover:text-destructive"
            >
              <Skull className="h-3.5 w-3.5" /> Force kill (SIGKILL)
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// A process row; clicking it reveals inline Terminate / Kill actions.
function ProcRow({
  proc: p,
  selected,
  busy,
  onClick,
  onContextMenu,
  onKill,
}: {
  proc: Proc;
  selected: boolean;
  busy: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onKill: (pid: number, signal: "TERM" | "KILL") => void;
}) {
  return (
    <>
      <tr
        onClick={onClick}
        onContextMenu={onContextMenu}
        className={`cursor-pointer border-b border-border/50 hover:bg-accent/50 ${selected ? "bg-accent/60" : ""} ${
          busy ? "opacity-40" : ""
        }`}
      >
        <td className="px-2 py-1.5 font-mono">{p.pid}</td>
        <td className={`px-2 py-1.5 text-right font-mono ${p.cpu >= 50 ? "text-destructive" : ""}`}>
          {p.cpu.toFixed(1)}
        </td>
        <td className={`px-2 py-1.5 text-right font-mono ${p.mem >= 50 ? "text-warning" : ""}`}>
          {p.mem.toFixed(1)}
        </td>
        <td className="truncate px-2 py-1.5 font-mono" title={`${p.user} — ${p.command}`}>
          {p.command}
        </td>
      </tr>
      {selected && (
        <tr className="border-b border-border/50 bg-accent/30">
          <td colSpan={4} className="px-2 py-2">
            <div className="flex items-center gap-2">
              <span className="truncate text-[11px] text-muted-foreground">
                {p.user} · {p.command}
              </span>
              <div className="ml-auto flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-warning/40 text-warning hover:bg-warning/15"
                  onClick={(e) => {
                    e.stopPropagation();
                    onKill(p.pid, "TERM");
                  }}
                >
                  <Ban className="h-3.5 w-3.5" /> Terminate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-destructive/40 text-destructive hover:bg-destructive/15"
                  onClick={(e) => {
                    e.stopPropagation();
                    onKill(p.pid, "KILL");
                  }}
                >
                  <Skull className="h-3.5 w-3.5" /> Kill
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
