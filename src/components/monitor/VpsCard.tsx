import { HardDrive, Activity, ArrowDown, ArrowUp, Clock, Trash2 } from "lucide-react";
import type { Vps, VpsStatus } from "../../lib/api.ts";
import { fmtRate, fmtUptime, memPct, diskPct } from "../../lib/format.ts";
import { Card } from "../ui/card.tsx";
import { Badge } from "../ui/badge.tsx";
import { StatusDot } from "./StatusDot.tsx";
import { StatRing } from "./StatRing.tsx";
import { Sparkline } from "./Sparkline.tsx";

export function VpsCard({ vps, status, onRemove }: { vps: Vps; status?: VpsStatus; onRemove: () => void }) {
  const online = status?.online ?? false;
  const dpct = status ? diskPct(status.disk_used_gb, status.disk_total_gb) : 0;

  return (
    <Card className="group flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <StatusDot online={online} />
          <div>
            <div className="text-sm font-semibold leading-tight">{vps.name}</div>
            <div className="text-[11px] text-muted-foreground">
              {vps.user}@{vps.host}
            </div>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
          aria-label="Remove"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {!online ? (
        <div className="flex h-[92px] items-center justify-center rounded-md bg-muted/30 text-xs text-muted-foreground">
          {status?.error ? status.error.slice(0, 60) : "offline"}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-around">
            <StatRing value={status!.cpu_pct} label="CPU" />
            <StatRing value={memPct(status!.mem_used_mb, status!.mem_total_mb)} label="MEM" />
            <div className="flex flex-col items-center gap-1">
              <Sparkline data={status!.cpu_history} width={90} height={44} />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">CPU trend</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <HardDrive className="h-3 w-3" /> {status!.disk_used_gb.toFixed(0)}/{status!.disk_total_gb.toFixed(0)} GB
              <span className={dpct >= 85 ? "text-destructive" : ""}>({dpct.toFixed(0)}%)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Activity className="h-3 w-3" /> load {status!.load[0].toFixed(2)}
            </span>
            <span className="flex items-center gap-1.5">
              <ArrowDown className="h-3 w-3" /> {fmtRate(status!.net_rx_kbps)}
              <ArrowUp className="h-3 w-3" /> {fmtRate(status!.net_tx_kbps)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> {fmtUptime(status!.uptime_secs)}
            </span>
          </div>
        </>
      )}

      {vps.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {vps.tags.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}
