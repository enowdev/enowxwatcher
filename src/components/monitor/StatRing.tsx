// A compact circular gauge (CPU/MEM %). Color shifts with severity.
export function StatRing({
  value,
  label,
  size = 56,
}: {
  value: number; // 0..100
  label: string;
  size?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  const color =
    pct >= 90 ? "hsl(var(--destructive))" : pct >= 70 ? "hsl(var(--warning))" : "hsl(var(--primary))";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="rotate-90 fill-foreground text-[11px] font-semibold"
          style={{ transformOrigin: "center" }}
        >
          {Math.round(pct)}%
        </text>
      </svg>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}
