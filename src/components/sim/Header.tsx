import { Stethoscope, Cpu } from "lucide-react";

export function Header() {
  return (
    <header className="glass-panel px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div
          className="relative w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          <Stethoscope className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-bold leading-tight">
            <span className="text-gradient-primary">MicroSteady</span>{" "}
            <span className="text-foreground/90">Tremor Cancellation Lab</span>
          </h1>
          <p className="text-[11px] sm:text-xs text-muted-foreground">
            Active 8–12 Hz tremor rejection · PID + 2nd-order Notch · ME Vibrations &amp; Control
          </p>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-3">
        <div className="glass-panel-sm px-3 py-1.5 flex items-center gap-2 text-[11px]">
          <Cpu className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono text-muted-foreground">120 Hz · IIR Bilinear</span>
        </div>
        <div className="glass-panel-sm px-3 py-1.5 text-[11px] text-muted-foreground hidden lg:block">
          IIT Kanpur · Group Project
        </div>
      </div>
    </header>
  );
}
