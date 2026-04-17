import { useEffect, useRef, useState, useCallback } from "react";
import { PIDController, NotchFilter, TremorSource, dftMagnitude, rms, maxAbs } from "@/lib/dsp";
import { generatePath, distanceToPath, type PathKind, type PathPoint } from "@/lib/paths";

export type ControllerMode = "off" | "pid" | "pid_notch";

export interface SimParams {
  tremorAmp: number;       // px
  tremorFreq: number;      // Hz
  tremorNoise: number;     // px
  kp: number; ki: number; kd: number;
  notchHz: number;
  notchZeta: number;
  mode: ControllerMode;
  tremorEnabled: boolean;
  pathKind: PathKind;
}

export interface SimSample {
  t: number;
  raw: { x: number; y: number };
  tremor: { x: number; y: number };
  filtered: { x: number; y: number };
}

export interface Metrics {
  rmsTremor: number;
  rmsFiltered: number;
  maxTremor: number;
  maxFiltered: number;
  attenuationPct: number;
}

const SAMPLE_RATE = 120; // Hz – render-friendly
const HISTORY = 240;     // ~2 s of samples for plots & FFT

export interface UseSimulatorReturn {
  params: SimParams;
  setParams: (p: Partial<SimParams>) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  history: SimSample[];
  fftTremor: number[];
  fftFiltered: number[];
  metrics: Metrics;
  path: PathPoint[];
  resetTrails: () => void;
  isTracking: boolean;
}

export function useSimulator(): UseSimulatorReturn {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [params, setParamsState] = useState<SimParams>({
    tremorAmp: 8,
    tremorFreq: 10,
    tremorNoise: 1.2,
    // Defaults from the IITK paper / accompanying control.py notebook
    kp: 350,
    ki: 50,
    kd: 60,
    notchHz: 10,
    notchZeta: 0.05,
    mode: "pid_notch",
    tremorEnabled: true,
    pathKind: "line",
  });
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const setParams = useCallback((p: Partial<SimParams>) => {
    setParamsState((prev) => ({ ...prev, ...p }));
  }, []);

  const [history, setHistory] = useState<SimSample[]>([]);
  const [fftTremor, setFftTremor] = useState<number[]>([]);
  const [fftFiltered, setFftFiltered] = useState<number[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    rmsTremor: 0, rmsFiltered: 0, maxTremor: 0, maxFiltered: 0, attenuationPct: 0,
  });
  const [path, setPath] = useState<PathPoint[]>([]);
  const [isTracking, setIsTracking] = useState(false);

  // Engine refs (don't trigger re-renders)
  const pidX = useRef(new PIDController(params.kp, params.ki, params.kd, SAMPLE_RATE));
  const pidY = useRef(new PIDController(params.kp, params.ki, params.kd, SAMPLE_RATE));
  const notchX = useRef(new NotchFilter(params.notchHz, params.notchZeta, SAMPLE_RATE));
  const notchY = useRef(new NotchFilter(params.notchHz, params.notchZeta, SAMPLE_RATE));
  const tremor = useRef(new TremorSource(params.tremorAmp, params.tremorFreq, params.tremorNoise));

  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const lastFilteredRef = useRef<{ x: number; y: number } | null>(null);
  const trailRef = useRef<SimSample[]>([]);
  const trailDrawRef = useRef<{ raw: PathPoint[]; tremor: PathPoint[]; filtered: PathPoint[] }>({
    raw: [], tremor: [], filtered: [],
  });
  const startTimeRef = useRef(performance.now());

  // Re-tune engine on param changes
  useEffect(() => {
    pidX.current.setGains(params.kp, params.ki, params.kd);
    pidY.current.setGains(params.kp, params.ki, params.kd);
    notchX.current.design(params.notchHz, params.notchZeta);
    notchY.current.design(params.notchHz, params.notchZeta);
    tremor.current.amplitude = params.tremorAmp;
    tremor.current.freq = params.tremorFreq;
    tremor.current.noise = params.tremorNoise;
  }, [params.kp, params.ki, params.kd, params.notchHz, params.notchZeta,
      params.tremorAmp, params.tremorFreq, params.tremorNoise]);

  const resetTrails = useCallback(() => {
    trailRef.current = [];
    trailDrawRef.current = { raw: [], tremor: [], filtered: [] };
    pidX.current.reset(); pidY.current.reset();
    notchX.current.reset(); notchY.current.reset();
    lastFilteredRef.current = null;
    setHistory([]);
    setFftTremor([]); setFftFiltered([]);
  }, []);

  // Mouse handlers + path generation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updatePath = () => {
      const rect = canvas.getBoundingClientRect();
      // Match canvas internal size to display size for crisp rendering
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      setPath(generatePath(paramsRef.current.pathKind, rect.width, rect.height));
    };
    updatePath();

    const ro = new ResizeObserver(updatePath);
    ro.observe(canvas);

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setIsTracking(true);
    };
    const onLeave = () => { setIsTracking(false); };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      ro.disconnect();
    };
  }, []);

  // Regenerate path when kind changes
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setPath(generatePath(params.pathKind, rect.width, rect.height));
    resetTrails();
  }, [params.pathKind, resetTrails]);

  // Main simulation + render loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const stepMs = 1000 / SAMPLE_RATE;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      acc += now - last;
      last = now;

      const p = paramsRef.current;
      const m = mouseRef.current;
      const tSec = (now - startTimeRef.current) / 1000;

      while (acc >= stepMs) {
        acc -= stepMs;
        if (m) {
          // 1) Raw
          const raw = { x: m.x, y: m.y };
          // 2) Tremor-injected
          const tr = p.tremorEnabled ? tremor.current.sample(tSec) : { dx: 0, dy: 0 };
          const tremored = { x: raw.x + tr.dx, y: raw.y + tr.dy };

          // 3) Filtered
          let fx = tremored.x, fy = tremored.y;
          if (p.mode !== "off") {
            if (p.mode === "pid_notch") {
              fx = notchX.current.process(fx);
              fy = notchY.current.process(fy);
            }
            // PID tracks raw setpoint to reject what notch missed and ensure tracking
            fx = pidX.current.update(raw.x, fx);
            fy = pidY.current.update(raw.y, fy);
          }
          lastFilteredRef.current = { x: fx, y: fy };

          const sample: SimSample = {
            t: tSec, raw, tremor: tremored, filtered: { x: fx, y: fy },
          };
          trailRef.current.push(sample);
          if (trailRef.current.length > HISTORY) trailRef.current.shift();

          const draw = trailDrawRef.current;
          draw.raw.push(raw);
          draw.tremor.push(tremored);
          draw.filtered.push({ x: fx, y: fy });
          const MAX_DRAW = 220;
          if (draw.raw.length > MAX_DRAW) draw.raw.shift();
          if (draw.tremor.length > MAX_DRAW) draw.tremor.shift();
          if (draw.filtered.length > MAX_DRAW) draw.filtered.shift();
        }
      }

      // ---- Render ----
      drawScene(ctx, w, h, path, trailDrawRef.current, lastFilteredRef.current, mouseRef.current);

      return;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [path]);

  // Periodic stats: history + FFT + metrics (decoupled from RAF for perf)
  useEffect(() => {
    const id = setInterval(() => {
      const samples = trailRef.current.slice();
      setHistory(samples);
      if (samples.length >= 64) {
        const N = 128;
        const slice = samples.slice(-N);
        const tremorErr = slice.map((s) => Math.hypot(s.tremor.x - s.raw.x, s.tremor.y - s.raw.y));
        const filteredErr = slice.map((s) => Math.hypot(s.filtered.x - s.raw.x, s.filtered.y - s.raw.y));
        const fT = dftMagnitude(tremorErr);
        const fF = dftMagnitude(filteredErr);
        setFftTremor(fT);
        setFftFiltered(fF);
        const rT = rms(tremorErr), rF = rms(filteredErr);
        const mT = maxAbs(tremorErr), mF = maxAbs(filteredErr);
        setMetrics({
          rmsTremor: rT,
          rmsFiltered: rF,
          maxTremor: mT,
          maxFiltered: mF,
          attenuationPct: rT > 0 ? Math.max(0, Math.min(100, (1 - rF / rT) * 100)) : 0,
        });
      }
    }, 120);
    return () => clearInterval(id);
  }, []);

  return {
    params, setParams, canvasRef, history, fftTremor, fftFiltered, metrics, path,
    resetTrails, isTracking,
  };
}

// Helpers below

function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  path: PathPoint[],
  trails: { raw: PathPoint[]; tremor: PathPoint[]; filtered: PathPoint[] },
  cursor: { x: number; y: number } | null,
  mouse: { x: number; y: number } | null,
) {
  // Background gradient (operating field)
  const bg = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, Math.max(w, h) / 1.2);
  bg.addColorStop(0, "rgba(255,255,255,0.04)");
  bg.addColorStop(1, "rgba(0,0,0,0.0)");
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle grid
  ctx.save();
  ctx.strokeStyle = "rgba(180,220,255,0.06)";
  ctx.lineWidth = 1;
  const step = 40;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.restore();

  // Target path (incision line)
  if (path.length > 1) {
    ctx.save();
    ctx.shadowColor = "rgba(160,220,255,0.45)";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "rgba(200,230,255,0.55)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
    ctx.restore();
  }

  // Trails
  drawTrail(ctx, trails.raw, "rgba(96,165,250,0.55)", 1.5);    // raw blue
  drawTrail(ctx, trails.tremor, "rgba(248,113,113,0.55)", 1.5); // tremor red
  drawTrail(ctx, trails.filtered, "rgba(74,222,128,0.95)", 2.5, true); // filtered green – glow

  // Cursor markers
  if (mouse) {
    drawCursor(ctx, mouse.x, mouse.y, "rgba(96,165,250,1)", 4); // raw
  }
  if (cursor) {
    drawCursor(ctx, cursor.x, cursor.y, "rgba(74,222,128,1)", 7, true); // tool tip
    // Tool shaft
    ctx.save();
    ctx.strokeStyle = "rgba(220,240,255,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cursor.x + 18, cursor.y - 18);
    ctx.lineTo(cursor.x, cursor.y);
    ctx.stroke();
    ctx.restore();
  }
}

function drawTrail(
  ctx: CanvasRenderingContext2D, pts: PathPoint[], color: string, width: number, glow = false,
) {
  if (pts.length < 2) return;
  ctx.save();
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();
}

function drawCursor(
  ctx: CanvasRenderingContext2D, x: number, y: number, color: string, r: number, glow = false,
) {
  ctx.save();
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 16; }
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export { distanceToPath, SAMPLE_RATE };
