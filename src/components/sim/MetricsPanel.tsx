import type { Metrics } from "@/hooks/useSimulator";
import { TrendingDown, Activity, Target, Gauge } from "lucide-react";

function Stat({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="glass-panel-sm p-4 flex items-start gap-3">
      <div
        className="p-2 rounded-lg"
        style={{ background: accent ?? "color-mix(in oklab, var(--primary) 18%, transparent)" }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </div>
        <div className="text-xl font-bold tabular-nums text-foreground leading-tight">
          {value}
        </div>
        {sub && (
          <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{sub}</div>
        )}
      </div>
    </div>
  );
}

export function MetricsPanel({ metrics }: { metrics: Metrics }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Stat
        icon={<TrendingDown className="w-4 h-4 text-[oklch(0.78_0.18_145)]" />}
        label="Tremor Attenuation"
        value={`${metrics.attenuationPct.toFixed(1)}%`}
        sub="vs. uncontrolled"
        accent="color-mix(in oklab, oklch(0.78 0.18 145) 18%, transparent)"
      />
      <Stat
        icon={<Activity className="w-4 h-4 text-[oklch(0.72_0.18_235)]" />}
        label="RMS Error"
        value={`${metrics.rmsFiltered.toFixed(2)} px`}
        sub={`raw: ${metrics.rmsTremor.toFixed(2)} px`}
      />
      <Stat
        icon={<Target className="w-4 h-4 text-[oklch(0.68_0.22_25)]" />}
        label="Max Deviation"
        value={`${metrics.maxFiltered.toFixed(2)} px`}
        sub={`raw: ${metrics.maxTremor.toFixed(2)} px`}
        accent="color-mix(in oklab, oklch(0.68 0.22 25) 18%, transparent)"
      />
      <Stat
        icon={<Gauge className="w-4 h-4 text-primary" />}
        label="Sample Rate"
        value="120 Hz"
        sub="bilinear notch IIR"
      />
    </div>
  );
}
