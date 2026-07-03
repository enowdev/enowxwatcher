// A tiny inline sparkline for the CPU history (0..100 values).
export function Sparkline({ data, width = 120, height = 28 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) {
    return <div style={{ width, height }} className="rounded bg-muted/40" />;
  }
  const max = 100;
  const step = width / (data.length - 1);
  const pts = data
    .map((v, i) => `${i * step},${height - (Math.max(0, Math.min(max, v)) / max) * height}`)
    .join(" ");
  const last = data[data.length - 1];
  const color = last >= 90 ? "hsl(var(--destructive))" : last >= 70 ? "hsl(var(--warning))" : "hsl(var(--primary))";
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
