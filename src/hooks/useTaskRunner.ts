import { useCallback, useEffect, useRef, useState } from "react";
import type { ControllerMode, SimSample, UseSimulatorReturn } from "./useSimulator";
import { distanceToPath, type PathPoint } from "@/lib/paths";
import { rms, maxAbs } from "@/lib/dsp";

export type TaskKind = "incision" | "circle" | "suture";
export type TaskPhase = "idle" | "countdown" | "running" | "between" | "done";

const TASK_TO_PATH: Record<TaskKind, "line" | "circle" | "sine"> = {
  incision: "line",
  circle: "circle",
  suture: "sine",
};

const TASK_LABEL: Record<TaskKind, string> = {
  incision: "Trace the straight incision line",
  circle: "Trace the circular suture loop",
  suture: "Trace the sinusoidal suture path",
};

const MODE_ORDER: ControllerMode[] = ["off", "pid", "pid_notch"];
const COUNTDOWN_SECONDS = 3;
const MIN_TRIAL_SECONDS = 3; // can't finish before this

export interface TrialResult {
  mode: ControllerMode;
  rmsTremor: number;
  rmsFiltered: number;
  maxFiltered: number;
  pathDeviation: number;
  attenuationPct: number;
  samples: number;
}

export interface UseTaskRunnerReturn {
  task: TaskKind;
  setTask: (t: TaskKind) => void;
  phase: TaskPhase;
  activeMode: ControllerMode | null;
  countdown: number;       // seconds left during countdown phase
  elapsed: number;         // seconds elapsed during running phase
  canFinish: boolean;      // true when running and >= MIN_TRIAL_SECONDS
  results: TrialResult[];
  start: () => void;
  finishTrial: () => void; // user presses Enter to end current trial
  cancel: () => void;
  reset: () => void;
  trialIndex: number;
  totalTrials: number;
}

export function useTaskRunner(sim: UseSimulatorReturn): UseTaskRunnerReturn {
  const [task, setTaskState] = useState<TaskKind>("incision");
  const [phase, setPhase] = useState<TaskPhase>("idle");
  const [trialIndex, setTrialIndex] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState<TrialResult[]>([]);
  const trialBufferRef = useRef<SimSample[]>([]);
  const collectingRef = useRef(false);

  // Refs that always mirror latest values (so handlers don't capture stale state)
  const phaseRef = useRef(phase);
  const trialIndexRef = useRef(trialIndex);
  const elapsedRef = useRef(elapsed);
  const simRef = useRef(sim);
  phaseRef.current = phase;
  trialIndexRef.current = trialIndex;
  elapsedRef.current = elapsed;
  simRef.current = sim;

  const setTask = useCallback((t: TaskKind) => {
    setTaskState(t);
    sim.setParams({ pathKind: TASK_TO_PATH[t] });
    setResults([]);
    setPhase("idle");
    setTrialIndex(0);
    setCountdown(0);
    setElapsed(0);
  }, [sim]);

  const reset = useCallback(() => {
    collectingRef.current = false;
    trialBufferRef.current = [];
    setResults([]);
    setPhase("idle");
    setTrialIndex(0);
    setCountdown(0);
    setElapsed(0);
  }, []);

  const cancel = useCallback(() => {
    collectingRef.current = false;
    trialBufferRef.current = [];
    setPhase("idle");
    setCountdown(0);
    setElapsed(0);
  }, []);

  // Begin a specific trial (mode index)
  const beginTrial = useCallback((idx: number) => {
    const mode = MODE_ORDER[idx];
    simRef.current.setParams({ mode });
    simRef.current.resetTrails();
    trialBufferRef.current = [];
    collectingRef.current = true;
    setTrialIndex(idx);
    setElapsed(0);
    setPhase("running");
  }, []);

  const start = useCallback(() => {
    sim.setParams({ pathKind: TASK_TO_PATH[task], tremorEnabled: true, mode: "off" });
    sim.resetTrails();
    setResults([]);
    setTrialIndex(0);
    setCountdown(COUNTDOWN_SECONDS);
    setElapsed(0);
    setPhase("countdown");
  }, [sim, task]);

  // User finishes current trial
  const finishTrial = useCallback(() => {
    if (phaseRef.current !== "running") return;
    if (elapsedRef.current < MIN_TRIAL_SECONDS) return;

    collectingRef.current = false;
    const buf = trialBufferRef.current.slice();
    const path = simRef.current.path;
    const idx = trialIndexRef.current;
    const result = summarize(MODE_ORDER[idx], buf, path);

    setResults((prev) => [...prev, result]);

    if (idx + 1 >= MODE_ORDER.length) {
      setPhase("done");
      setElapsed(0);
    } else {
      // Brief countdown before next trial
      setCountdown(COUNTDOWN_SECONDS);
      setElapsed(0);
      setPhase("between");
    }
  }, []);

  // ─── COUNTDOWN tick ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "countdown") return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c > 1) return c - 1;
        // reached 0 → start first trial on next tick
        clearInterval(id);
        beginTrial(0);
        return 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, beginTrial]);

  // ─── BETWEEN-TRIAL countdown ────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "between") return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c > 1) return c - 1;
        clearInterval(id);
        beginTrial(trialIndexRef.current + 1);
        return 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, beginTrial]);

  // ─── RUNNING: count up elapsed seconds ──────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    setElapsed(0);
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // ─── RUNNING: collect samples ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    let lastT = -Infinity;
    const id = setInterval(() => {
      if (!collectingRef.current) return;
      const samples = simRef.current.getRecentSamples();
      for (const s of samples) {
        if (s.t > lastT) {
          trialBufferRef.current.push(s);
          lastT = s.t;
        }
      }
    }, 33);
    return () => clearInterval(id);
  }, [phase]);

  // ─── Keyboard: Enter finishes current trial ─────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        if (phaseRef.current === "running" && elapsedRef.current >= MIN_TRIAL_SECONDS) {
          e.preventDefault();
          finishTrial();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finishTrial]);

  const activeMode: ControllerMode | null =
    phase === "running" ? MODE_ORDER[trialIndex] : null;

  return {
    task, setTask, phase, activeMode, countdown, elapsed,
    canFinish: phase === "running" && elapsed >= MIN_TRIAL_SECONDS,
    results, start, finishTrial, cancel, reset,
    trialIndex,
    totalTrials: MODE_ORDER.length,
  };
}

function summarize(
  mode: ControllerMode,
  samples: SimSample[],
  path: PathPoint[],
): TrialResult {
  if (samples.length === 0) {
    return { mode, rmsTremor: 0, rmsFiltered: 0, maxFiltered: 0,
      pathDeviation: 0, attenuationPct: 0, samples: 0 };
  }
  const tremorErr = samples.map((s) => Math.hypot(s.tremor.x - s.raw.x, s.tremor.y - s.raw.y));
  const filteredErr = samples.map((s) => Math.hypot(s.filtered.x - s.raw.x, s.filtered.y - s.raw.y));
  const pathDev = path.length > 1
    ? samples.reduce((acc, s) => acc + distanceToPath(path, s.filtered.x, s.filtered.y), 0) / samples.length
    : 0;
  const rT = rms(tremorErr);
  const rF = rms(filteredErr);
  return {
    mode,
    rmsTremor: rT,
    rmsFiltered: rF,
    maxFiltered: maxAbs(filteredErr),
    pathDeviation: pathDev,
    attenuationPct: rT > 0 ? Math.max(0, Math.min(100, (1 - rF / rT) * 100)) : 0,
    samples: samples.length,
  };
}

export { TASK_LABEL, MODE_ORDER };
