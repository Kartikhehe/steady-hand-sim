import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RotateCcw, Activity } from "lucide-react";
import type { ControllerMode, SimParams } from "@/hooks/useSimulator";
import type { PathKind } from "@/lib/paths";

interface Props {
  params: SimParams;
  setParams: (p: Partial<SimParams>) => void;
  onReset: () => void;
}

function Row({
  label, value, unit, min, max, step, onChange,
}: {
  label: string; value: number; unit?: string;
  min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <Label className="text-muted-foreground font-medium">{label}</Label>
        <span className="font-mono text-foreground tabular-nums">
          {value.toFixed(step < 1 ? 2 : 1)}{unit ? ` ${unit}` : ""}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}

export function ControlsPanel({ params, setParams, onReset }: Props) {
  return (
    <aside className="glass-panel p-5 flex flex-col gap-5 h-full overflow-y-auto">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Console
          </h2>
        </div>
        <Button size="sm" variant="ghost" onClick={onReset} className="h-7 px-2">
          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
        </Button>
      </header>

      {/* Controller mode */}
      <section className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Controller
        </Label>
        <Tabs
          value={params.mode}
          onValueChange={(v) => setParams({ mode: v as ControllerMode })}
        >
          <TabsList className="grid grid-cols-3 w-full bg-muted/40">
            <TabsTrigger value="off" className="text-xs">Off</TabsTrigger>
            <TabsTrigger value="pid" className="text-xs">PID</TabsTrigger>
            <TabsTrigger value="pid_notch" className="text-xs">PID + Notch</TabsTrigger>
          </TabsList>
        </Tabs>
      </section>

      {/* Path */}
      <section className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Surgical Path
        </Label>
        <Tabs
          value={params.pathKind}
          onValueChange={(v) => setParams({ pathKind: v as PathKind })}
        >
          <TabsList className="grid grid-cols-3 w-full bg-muted/40">
            <TabsTrigger value="line" className="text-xs">Incision</TabsTrigger>
            <TabsTrigger value="circle" className="text-xs">Circle</TabsTrigger>
            <TabsTrigger value="sine" className="text-xs">Suture</TabsTrigger>
          </TabsList>
        </Tabs>
      </section>

      {/* Tremor */}
      <section className="space-y-3 glass-panel-sm p-4">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Synthetic Tremor
          </Label>
          <Switch
            checked={params.tremorEnabled}
            onCheckedChange={(v) => setParams({ tremorEnabled: v })}
          />
        </div>
        <Row
          label="Amplitude" value={params.tremorAmp} unit="px"
          min={0} max={25} step={0.5}
          onChange={(v) => setParams({ tremorAmp: v })}
        />
        <Row
          label="Frequency" value={params.tremorFreq} unit="Hz"
          min={6} max={14} step={0.1}
          onChange={(v) => setParams({ tremorFreq: v })}
        />
        <Row
          label="Noise" value={params.tremorNoise} unit="px"
          min={0} max={5} step={0.1}
          onChange={(v) => setParams({ tremorNoise: v })}
        />
      </section>

      {/* PID */}
      <section className="space-y-3 glass-panel-sm p-4">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          PID Gains
        </Label>
        <Row label="Kp" value={params.kp} min={0} max={800} step={5}
          onChange={(v) => setParams({ kp: v })} />
        <Row label="Ki" value={params.ki} min={0} max={200} step={1}
          onChange={(v) => setParams({ ki: v })} />
        <Row label="Kd" value={params.kd} min={0} max={200} step={1}
          onChange={(v) => setParams({ kd: v })} />
        <p className="text-[10px] text-muted-foreground/80 leading-snug">
          Reference (IITK paper): Kp=350, Ki=50, Kd=60 — tuned for 8–12 Hz attenuation on M=1, C=5, K=100 plant.
        </p>
      </section>

      {/* Notch */}
      <section className="space-y-3 glass-panel-sm p-4">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Notch Filter
        </Label>
        <Row label="Center fₙ" value={params.notchHz} unit="Hz"
          min={6} max={14} step={0.1}
          onChange={(v) => setParams({ notchHz: v })} />
        <Row label="Damping ζ" value={params.notchZeta} min={0.005} max={0.5} step={0.005}
          onChange={(v) => setParams({ notchZeta: v })} />
      </section>
    </aside>
  );
}
