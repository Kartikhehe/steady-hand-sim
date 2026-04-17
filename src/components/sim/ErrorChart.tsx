import { useMemo } from "react";
import type { SimSample } from "@/hooks/useSimulator";

interface Props {
  history: SimSample[];
}

// Plots tremor-error and filtered-error magnitude over time.
export function ErrorChart({ history }: Props) {
  const { paths, range } = useMemo(() => {
    if (history.length < 2) return { paths: { tremor: "", filtered: "" }, range: 1 };
    const tremorE = history.map((s) =>
      Math.hypot(s.tremor.x - s.raw.x, s.tremor.y - s.raw.y),
    );
    const filteredE = history.map((s) =>
      Math.hypot(s.filtered.x - s.raw.x, s.filtered.y - s.raw.y),
    );
    const max = Math.max(1, ...tremorE, ...filteredE);
    const W = 100, H = 100;
    const toPath = (vals: number[]) => {
      const dx = W / (vals.length - 1);
      return vals.map((v, i) => {
        const x = i * dx;
        const y = H - (v / max) * H;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      }).join(" ");
    };
    return {
      paths: { tremor: toPath(tremorE), filtered: toPath(filteredE) },
      range: max,
    };
  }, [history]);

  return (
    <div className="glass-panel-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          Tracking Error
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="ring-dot text-[oklch(0.68_0.22_25)]" />
            Tremor
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="ring-dot text-[oklch(0.78_0.18_145)]" />
            Filtered
          </span>
        </div>
      </div>
      <div className="relative aspect-[3/1] w-full">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {[25, 50, 75].map((y) => (
            <line
              key={y} x1="0" y1={y} x2="100" y2={y}
              stroke="oklch(1 0 0 / 0.06)" strokeWidth="0.3"
            />
          ))}
          <path d={paths.tremor} fill="none" stroke="oklch(0.68 0.22 25)" strokeWidth="0.6"
            vectorEffect="non-scaling-stroke" />
          <path d={paths.filtered} fill="none" stroke="oklch(0.78 0.18 145)" strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
            style={{ filter: "drop-shadow(0 0 3px oklch(0.78 0.18 145 / 0.6))" }} />
        </svg>
        <div className="absolute top-1 right-1 text-[9px] text-muted-foreground font-mono">
          max {range.toFixed(1)} px
        </div>
      </div>
    </div>
  );
}
