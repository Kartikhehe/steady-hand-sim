import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Play, Square, RefreshCw, Target, CheckCircle2, Trophy } from "lucide-react";
import {
  type TaskKind,
  type UseTaskRunnerReturn,
  TASK_LABEL,
  MODE_ORDER,
} from "@/hooks/useTaskRunner";
import type { ControllerMode } from "@/hooks/useSimulator";

const MODE_LABEL: Record<ControllerMode, string> = {
  off: "Controller Off",
  pid: "PID Only",
  pid_notch: "PID + Notch",
};
const MODE_SHORT: Record<ControllerMode, string> = {
  off: "Off",
  pid: "PID",
  pid_notch: "PID+Notch",
};

export function TaskPanel({ runner }: { runner: UseTaskRunnerReturn }) {
  const {
    task, setTask, phase, activeMode, countdown, elapsed, canFinish,
    results, start, finishTrial, cancel, reset, trialIndex, totalTrials,
  } = runner;

  const inProgress = phase !== "idle" && phase !== "done";

  return (
    <section className="glass-panel p-4 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Guided Task
          </h2>
        </div>
        {phase === "done" && (
          <Button size="sm" variant="ghost" onClick={reset} className="h-7 px-2">
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> New Run
          </Button>
        )}
      </header>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Choose a task
        </Label>
        <Tabs value={task} onValueChange={(v) => setTask(v as TaskKind)}>
          <TabsList className="grid grid-cols-3 w-full bg-muted/40">
            <TabsTrigger value="incision" className="text-xs" disabled={inProgress}>Incision</TabsTrigger>
            <TabsTrigger value="circle" className="text-xs" disabled={inProgress}>Circle</TabsTrigger>
            <TabsTrigger value="suture" className="text-xs" disabled={inProgress}>Suture</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted-foreground leading-snug">
          {TASK_LABEL[task]} with your mouse — slowly and steadily. The system runs
          {" "}<strong>3 trials</strong> (Off → PID → PID+Notch). Press
          {" "}<kbd className="px-1.5 py-0.5 rounded bg-muted/60 border border-border/50 text-[10px] font-mono">Enter</kbd>
          {" "}when done with each trial.
        </p>
      </div>

      {phase === "idle" && (
        <Button size="sm" onClick={start} className="w-full">
          <Play className="w-3.5 h-3.5 mr-1" /> Start trial sequence
        </Button>
      )}

      {phase === "countdown" && (
        <PhaseBox tone="primary">
          <div className="text-[11px] uppercase tracking-wider opacity-80">Get ready</div>
          <div className="text-3xl font-bold tabular-nums">{countdown}</div>
          <div className="text-xs opacity-80">First trial: <b>Controller Off</b></div>
        </PhaseBox>
      )}

      {phase === "running" && activeMode && (
        <PhaseBox tone={activeMode === "off" ? "danger" : activeMode === "pid" ? "warning" : "success"}>
          <div className="text-[11px] uppercase tracking-wider opacity-80">
            Trial {trialIndex + 1} of {totalTrials} · {MODE_LABEL[activeMode]}
          </div>
          <div className="text-3xl font-bold tabular-nums">{elapsed}s</div>
          <div className="text-xs opacity-80">
            Trace the path. Press{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-background/40 border border-border/50 text-[10px] font-mono">Enter</kbd>
            {" "}when done.
          </div>
          <Button
            size="sm"
            className="mt-2 w-full"
            onClick={finishTrial}
            disabled={!canFinish}
          >
            {canFinish
              ? `Finish trial — record ${MODE_LABEL[activeMode]}`
              : `Wait ${Math.max(0, 3 - elapsed)}s before finishing…`}
          </Button>
        </PhaseBox>
      )}

      {phase === "between" && (
        <PhaseBox tone="primary">
          <div className="text-[11px] uppercase tracking-wider opacity-80">Switching controller…</div>
          <div className="text-3xl font-bold tabular-nums">{countdown}</div>
          <div className="text-xs opacity-80">
            Next: <b>{MODE_LABEL[MODE_ORDER[trialIndex + 1]]}</b>
          </div>
        </PhaseBox>
      )}

      {inProgress && (
        <Button size="sm" variant="ghost" onClick={cancel}>
          <Square className="w-3.5 h-3.5 mr-1" /> Cancel
        </Button>
      )}

      {/* Results */}
      {phase === "done" && results.length === MODE_ORDER.length && (
        <ResultsTable results={results} />
      )}
    </section>
  );
}

function PhaseBox({
  children, tone,
}: {
  children: React.ReactNode;
  tone: "primary" | "success" | "warning" | "danger";
}) {
  const bg = {
    primary: "color-mix(in oklab, var(--primary) 16%, transparent)",
    success: "color-mix(in oklab, oklch(0.78 0.18 145) 16%, transparent)",
    warning: "color-mix(in oklab, oklch(0.85 0.16 85) 16%, transparent)",
    danger:  "color-mix(in oklab, oklch(0.68 0.22 25) 16%, transparent)",
  }[tone];
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: bg }}>
      {children}
    </div>
  );
}

function ResultsTable({ results }: { results: import("@/hooks/useTaskRunner").TrialResult[] }) {
  // Find best (lowest) RMS filtered to highlight winner
  const best = results.reduce((b, r) => (r.rmsFiltered < b.rmsFiltered ? r : b), results[0]);
  // Normalize bar widths against the worst case
  const maxRms = Math.max(...results.map((r) => r.rmsFiltered), 0.0001);
  const maxDev = Math.max(...results.map((r) => r.pathDeviation), 0.0001);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="w-3.5 h-3.5 text-[oklch(0.78_0.18_145)]" />
        Trial sequence complete — comparison below.
      </div>

      <div className="rounded-lg overflow-hidden border border-border/40">
        <div className="grid grid-cols-[1fr_repeat(3,minmax(0,1fr))] text-[10px] uppercase tracking-wider bg-muted/30 px-2 py-1.5 text-muted-foreground font-medium">
          <span>Metric</span>
          <span className="text-right">Off</span>
          <span className="text-right">PID</span>
          <span className="text-right">PID+Notch</span>
        </div>
        <MetricRow label="RMS error (px)" values={results.map((r) => r.rmsFiltered)} digits={2} lowerBetter />
        <MetricRow label="Max deviation (px)" values={results.map((r) => r.maxFiltered)} digits={2} lowerBetter />
        <MetricRow label="Mean path dev (px)" values={results.map((r) => r.pathDeviation)} digits={2} lowerBetter />
        <MetricRow label="Tremor attenuation" values={results.map((r) => r.attenuationPct)} digits={1} suffix="%" higherBetter />
      </div>

      {/* Visual bars for RMS */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          RMS error — lower is better
        </div>
        {results.map((r) => (
          <BarRow key={r.mode + "-rms"} label={MODE_SHORT[r.mode]} value={r.rmsFiltered} max={maxRms} unit="px" />
        ))}
      </div>
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Mean deviation from target path
        </div>
        {results.map((r) => (
          <BarRow key={r.mode + "-dev"} label={MODE_SHORT[r.mode]} value={r.pathDeviation} max={maxDev} unit="px" />
        ))}
      </div>

      <div
        className="rounded-lg p-3 flex items-center gap-2 text-xs"
        style={{ background: "color-mix(in oklab, oklch(0.78 0.18 145) 18%, transparent)" }}
      >
        <Trophy className="w-4 h-4 text-[oklch(0.78_0.18_145)]" />
        <span>
          Best stabilization: <b>{MODE_LABEL[best.mode]}</b> — RMS {best.rmsFiltered.toFixed(2)} px,
          attenuation {best.attenuationPct.toFixed(1)}%.
        </span>
      </div>
    </div>
  );
}

function MetricRow({
  label, values, digits, suffix, lowerBetter, higherBetter,
}: {
  label: string;
  values: number[];
  digits: number;
  suffix?: string;
  lowerBetter?: boolean;
  higherBetter?: boolean;
}) {
  const bestVal = lowerBetter ? Math.min(...values) : higherBetter ? Math.max(...values) : NaN;
  return (
    <div className="grid grid-cols-[1fr_repeat(3,minmax(0,1fr))] px-2 py-1.5 text-xs border-t border-border/30 items-center">
      <span className="text-muted-foreground">{label}</span>
      {values.map((v, i) => {
        const isBest = !Number.isNaN(bestVal) && v === bestVal;
        return (
          <span
            key={i}
            className={`text-right tabular-nums font-mono ${isBest ? "text-[oklch(0.78_0.18_145)] font-semibold" : "text-foreground"}`}
          >
            {v.toFixed(digits)}{suffix ?? ""}
          </span>
        );
      })}
    </div>
  );
}

function BarRow({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const pct = Math.max(2, (value / max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-muted-foreground">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, var(--primary), color-mix(in oklab, var(--primary) 40%, transparent))",
          }}
        />
      </div>
      <span className="w-16 text-right tabular-nums font-mono">{value.toFixed(2)} {unit}</span>
    </div>
  );
}
