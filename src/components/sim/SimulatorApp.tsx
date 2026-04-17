import { useSimulator, SAMPLE_RATE } from "@/hooks/useSimulator";
import { useTaskRunner, TASK_LABEL } from "@/hooks/useTaskRunner";
import { ControlsPanel } from "./ControlsPanel";
import { MetricsPanel } from "./MetricsPanel";
import { ErrorChart } from "./ErrorChart";
import { FFTChart } from "./FFTChart";
import { Header } from "./Header";
import { TaskPanel } from "./TaskPanel";

const MODE_DESC: Record<string, string> = {
  off: "Open Loop · No Stabilization",
  pid: "Closed Loop · PID Active",
  pid_notch: "Closed Loop · PID + Notch",
};

export function SimulatorApp() {
  const sim = useSimulator();
  const runner = useTaskRunner(sim);

  const taskHint =
    runner.phase === "idle"
      ? "Pick a task on the right and press Start to begin."
      : runner.phase === "countdown"
      ? `Get ready — ${TASK_LABEL[runner.task]} (${runner.remaining}s)`
      : runner.phase === "running"
      ? `${TASK_LABEL[runner.task]} — ${runner.remaining}s left`
      : runner.phase === "between"
      ? "Switching controller… keep your mouse on the field."
      : "All trials complete — review the comparison on the right.";

  return (
    <div className="min-h-screen p-3 sm:p-5 flex flex-col gap-4">
      <Header />

      <div className="grid gap-4 flex-1 min-h-0
                      grid-cols-1
                      lg:grid-cols-[300px_minmax(0,1fr)_380px]">
        {/* Left: controls */}
        <ControlsPanel
          params={sim.params}
          setParams={sim.setParams}
          onReset={sim.resetTrails}
        />

        {/* Center: 3D-styled operating canvas */}
        <section className="glass-panel relative overflow-hidden flex flex-col min-h-[420px] lg:min-h-0">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "var(--gradient-glow)", opacity: 0.7 }}
          />
          <div className="px-5 pt-4 pb-3 flex items-center justify-between relative z-10">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Operating Field
              </div>
              <div className="text-sm font-semibold">
                {MODE_DESC[sim.params.mode]}
                {sim.params.mode === "pid_notch" && ` @ ${sim.params.notchHz.toFixed(1)} Hz`}
              </div>
            </div>
            <Legend />
          </div>

          <div className="relative flex-1 mx-3 mb-3 rounded-xl overflow-hidden"
               style={{
                 background:
                   "radial-gradient(circle at 30% 20%, oklch(0.22 0.04 220 / 0.9), oklch(0.12 0.02 240 / 0.95))",
                 boxShadow:
                   "inset 0 2px 12px oklch(0 0 0 / 0.6), inset 0 0 60px oklch(0.78 0.16 195 / 0.08)",
                 border: "1px solid oklch(0.4 0.05 220 / 0.4)",
               }}
          >
            <canvas
              ref={sim.canvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
            />

            {/* Task hint banner — top */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none">
              <div className="glass-panel-sm px-3 py-1.5 text-[11px] text-foreground/90 whitespace-nowrap max-w-[90vw] sm:max-w-none">
                {taskHint}
              </div>
            </div>

            {/* Active trial badge */}
            {runner.phase === "running" && runner.activeMode && (
              <div className="absolute top-3 right-3 pointer-events-none">
                <div
                  className="px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider"
                  style={{
                    background: runner.activeMode === "off"
                      ? "color-mix(in oklab, oklch(0.68 0.22 25) 25%, transparent)"
                      : runner.activeMode === "pid"
                      ? "color-mix(in oklab, oklch(0.85 0.16 85) 25%, transparent)"
                      : "color-mix(in oklab, oklch(0.78 0.18 145) 25%, transparent)",
                    border: "1px solid color-mix(in oklab, currentColor 30%, transparent)",
                  }}
                >
                  Trial {runner.trialIndex + 1}/{runner.totalTrials} · {runner.activeMode === "pid_notch" ? "PID+Notch" : runner.activeMode === "pid" ? "PID" : "Off"}
                </div>
              </div>
            )}

            {!sim.isTracking && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="glass-panel-sm px-4 py-2 text-xs text-muted-foreground">
                  Move your mouse over the field to begin
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right: task + telemetry */}
        <aside className="flex flex-col gap-4 min-h-0 overflow-y-auto">
          <TaskPanel runner={runner} />
          <MetricsPanel metrics={sim.metrics} />
          <ErrorChart history={sim.history} />
          <FFTChart
            fftTremor={sim.fftTremor}
            fftFiltered={sim.fftFiltered}
            sampleRate={SAMPLE_RATE}
            notchHz={sim.params.notchHz}
          />
        </aside>
      </div>

      <footer className="glass-panel-sm px-4 py-2 text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-2">
        <span>
          Based on “Active Tremor Cancellation in Microsurgical Robotic Arms”
          — Bhargavi P. Singh, Karan Singh, Kartik Raj, Mahak Garg, Muskan Kumari, Yajat Parikh ·
          Department of Mechanical Engineering, IIT Kanpur
        </span>
        <span className="font-mono text-foreground/60">
          M ẍ + C ẋ + K x = F<sub>cmd</sub> + F<sub>tremor</sub>
        </span>
      </footer>
    </div>
  );
}

function Legend() {
  const Item = ({ color, label }: { color: string; label: string }) => (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="ring-dot" style={{ color }} />
      {label}
    </div>
  );
  return (
    <div className="hidden sm:flex items-center gap-3">
      <Item color="oklch(0.85 0.05 230)" label="Target" />
      <Item color="oklch(0.72 0.18 235)" label="Raw" />
      <Item color="oklch(0.68 0.22 25)" label="Tremor" />
      <Item color="oklch(0.78 0.18 145)" label="Filtered" />
    </div>
  );
}

