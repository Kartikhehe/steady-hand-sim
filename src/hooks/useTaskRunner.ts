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
const TRIAL_SECONDS = 12;
const COUNTDOWN_SECONDS = 3;
const BETWEEN_SECONDS = 2;

export interface TrialResult {
  mode: ControllerMode;
  rmsTremor: number;        // raw → tremor error (px)
  rmsFiltered: number;      // raw → filtered error (px) — what the surgeon delivers
  maxFiltered: number;      // worst-case deviation (px)
  pathDeviation: number;    // mean distance from filtered tip to target path (px)
  attenuationPct: number;   // (1 - filtered/tremor)
  samples: number;
}

export interface UseTaskRunnerReturn {
  task: TaskKind;
  setTask: (t: TaskKind) => void;
  phase: TaskPhase;
  activeMode: ControllerMode | null;
  remaining: number;
  results: TrialResult[];
  start: () => void;
  cancel: () => void;
  reset: () => void;
  trialIndex: number;
  totalTrials: number;
}

export function useTaskRunner(sim: UseSimulatorReturn): UseTaskRunnerReturn {
  const [task, setTaskState] = useState<TaskKind>("incision");
  const [phase, setPhase] = useState<TaskPhase>("idle");
  const [trialIndex, setTrialIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [results, setResults] = useState<TrialResult[]>([]);
  const trialBufferRef = useRef<SimSample[]>([]);
  const collectingRef = useRef(false);

  const setTask = useCallback((t: TaskKind) => {
    setTaskState(t);
    sim.setParams({ pathKind: TASK_TO_PATH[t] });
    setResults([]);
    setPhase("idle");
    setTrialIndex(0);
  }, [sim]);

  const reset = useCallback(() => {
    setResults([]);
    setPhase("idle");
    setTrialIndex(0);
    collectingRef.current = false;
    trialBufferRef.current = [];
  }, []);

  const cancel = useCallback(() => {
    collectingRef.current = false;
    trialBufferRef.current = [];
    setPhase("idle");
    setRemaining(0);
  }, []);

  const start = useCallback(() => {
    sim.setParams({ pathKind: TASK_TO_PATH[task], tremorEnabled: true });
    setResults([]);
    setTrialIndex(0);
    setPhase("countdown");
    setRemaining(COUNTDOWN_SECONDS);
  }, [sim, task]);

  // Sample-collection loop: runs at ~30 Hz during the active trial,
  // appending any *new* samples that arrived from the simulator since last tick.
  useEffect(() => {
    if (phase !== "running") return;
    let lastT = -Infinity;
    const id = setInterval(() => {
      if (!collectingRef.current) return;
      const samples = sim.getRecentSamples();
      for (const s of samples) {
        if (s.t > lastT) {
          trialBufferRef.current.push(s);
          lastT = s.t;
        }
      }
    }, 33);
    return () => clearInterval(id);
  }, [phase, sim]);

  // Phase state machine driven by a 1-second tick.
  useEffect(() => {
    if (phase === "idle" || phase === "done") return;

    const tick = setInterval(() => {
      setRemaining((r) => {
        if (r > 1) return r - 1;
        // r === 1 → transition
        finishPhase();
        return 0;
      });
    }, 1000);
    return () => clearInterval(tick);

    function finishPhase() {
      if (phase === "countdown") {
        // Begin first trial
        beginTrial(0);
      } else if (phase === "running") {
        completeTrial();
      } else if (phase === "between") {
        beginTrial(trialIndex + 1);
      }
    }

    function beginTrial(idx: number) {
      if (idx >= MODE_ORDER.length) return;
      const mode = MODE_ORDER[idx];
      sim.setParams({ mode });
      sim.resetTrails();
      trialBufferRef.current = [];
      collectingRef.current = true;
      setTrialIndex(idx);
      setPhase("running");
      setRemaining(TRIAL_SECONDS);
    }

    function completeTrial() {
      collectingRef.current = false;
      const buf = trialBufferRef.current.slice();
      const path = sim.path;
      const result = summarize(MODE_ORDER[trialIndex], buf, path);
      setResults((prev) => [...prev, result]);

      if (trialIndex + 1 >= MODE_ORDER.length) {
        setPhase("done");
        setRemaining(0);
      } else {
        setPhase("between");
        setRemaining(BETWEEN_SECONDS);
      }
    }
  }, [phase, trialIndex, sim]);

  const activeMode: ControllerMode | null =
    phase === "running" ? MODE_ORDER[trialIndex] : null;

  return {
    task, setTask, phase, activeMode, remaining, results,
    start, cancel, reset,
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
