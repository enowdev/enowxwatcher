import { cn } from "../../lib/utils.ts";

export function StatusDot({ online, className }: { online: boolean; className?: string }) {
  return (
    <span className={cn("relative flex h-2.5 w-2.5", className)}>
      {online && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
      )}
      <span
        className={cn(
          "relative inline-flex h-2.5 w-2.5 rounded-full",
          online ? "bg-success" : "bg-destructive",
        )}
      />
    </span>
  );
}
