// A tiny inline sparkline for the CPU history (0..100 values). Auto-scales the
// Y axis to the data (so small idle fluctuations are visible) and fills the area
// under the line for a livelier look.
export function Sparkline({ data, width = 120, height = 28 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) {
    return <div style={{ width, height }} className="rounded bg-muted/30" />;
  }

  // Auto-scale: fit between min and (max + headroom), never a zero range.
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const pad = Math.max(3, (hi - lo) * 0.2); // headroom so the peak isn't clipped
  const top = hi + pad;
  const bottom = Math.max(0, lo - pad);
  const range = Math.max(1, top - bottom);

  const step = width / (data.length - 1);
  const y = (v: number) => height - ((Math.max(bottom, Math.min(top, v)) - bottom) / range) * height;
  const line = data.map((v, i) => `${i * step},${y(v)}`).join(" ");
  const area = `${line} ${width},${height} 0,${height}`;

  const last = data[data.length - 1];
  const color = last >= 90 ? "hsl(var(--destructive))" : last >= 70 ? "hsl(var(--warning))" : "hsl(var(--primary))";
  const id = `spark-${Math.round(color.length + width)}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
