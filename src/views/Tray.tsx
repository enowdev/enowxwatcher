import { Plus, ExternalLink, RefreshCw } from "lucide-react";
import { openMainWindow } from "../lib/api.ts";
import { useMonitor } from "../lib/useMonitor.ts";
import { memPct } from "../lib/format.ts";
import { StatusDot } from "../components/monitor/StatusDot.tsx";
import { Button } from "../components/ui/button.tsx";

// Compact popover shown when the tray icon is left-clicked.
export default function TrayView() {
  const { vpses, statuses } = useMonitor();

  return (
    <div className="m-2 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">enowxwatcher</span>
        <span className="text-[11px] text-muted-foreground">
          {vpses.filter((v) => statuses[v.id]?.online).length}/{vpses.length} online
        </span>
      </div>

      <div className="max-h-[300px] overflow-y-auto">
        {vpses.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No VPS yet. Open the app to add one.
          </div>
        ) : (
          vpses.map((v) => {
            const s = statuses[v.id];
            const online = s?.online ?? false;
            return (
              <div key={v.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-accent">
                <StatusDot online={online} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{v.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {online
                      ? `CPU ${Math.round(s!.cpu_pct)}%  MEM ${Math.round(memPct(s!.mem_used_mb, s!.mem_total_mb))}%`
                      : "offline"}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => openMainWindow()}>
          <ExternalLink className="h-3.5 w-3.5" /> Open App
        </Button>
        <Button size="sm" variant="ghost" onClick={() => openMainWindow()} aria-label="Add">
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => location.reload()} aria-label="Refresh">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
