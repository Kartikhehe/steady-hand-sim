import { useMemo } from "react";

interface Props {
  fftTremor: number[];
  fftFiltered: number[];
  sampleRate: number;
  notchHz: number;
}

// Bar/area-style FFT display — emphasizes the 8–12 Hz tremor peak collapsing.
export function FFTChart({ fftTremor, fftFiltered, sampleRate, notchHz }: Props) {
  const { tremorPath, filteredPath, freqs, maxV, notchX } = useMemo(() => {
    const N2 = Math.max(fftTremor.length, fftFiltered.length);
    if (N2 < 2) return { tremorPath: "", filteredPath: "", freqs: [] as number[], maxV: 1, notchX: 0 };
    const N = N2 * 2;
    const freqs: number[] = new Array(N2);
    for (let k = 0; k < N2; k++) freqs[k] = (k * sampleRate) / N;
    // Show 0..20 Hz
    const maxFreq = 20;
    const visIdx = freqs.findIndex((f) => f > maxFreq);
    const lastIdx = visIdx === -1 ? N2 - 1 : visIdx;
    const tSlice = fftTremor.slice(0, lastIdx);
    const fSlice = fftFiltered.slice(0, lastIdx);
    const mx = Math.max(0.001, ...tSlice, ...fSlice);
    const W = 100, H = 100;
    const toPath = (vals: number[]) => {
      const dx = W / (vals.length - 1);
      let d = `M0,${H}`;
      vals.forEach((v, i) => {
        const x = i * dx;
        const y = H - (v / mx) * H * 0.95;
        d += ` L${x.toFixed(2)},${y.toFixed(2)}`;
      });
      d += ` L${W},${H} Z`;
      return d;
    };
    const notchX = (notchHz / maxFreq) * 100;
    return {
      tremorPath: toPath(tSlice),
      filteredPath: toPath(fSlice),
      freqs: freqs.slice(0, lastIdx),
      maxV: mx,
      notchX,
    };
  }, [fftTremor, fftFiltered, sampleRate, notchHz]);

  return (
    <div className="glass-panel-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          FFT — Frequency Domain
        </div>
        <div className="text-[10px] text-muted-foreground font-mono">
          0–20 Hz · peak {maxV.toFixed(2)}
        </div>
      </div>
      <div className="relative aspect-[3/1] w-full">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          {/* 8–12 Hz tremor band highlight */}
          <rect
            x={(8 / 20) * 100} y="0"
            width={(4 / 20) * 100} height="100"
            fill="oklch(0.68 0.22 25 / 0.08)"
          />
          {/* notch line */}
          <line
            x1={notchX} y1="0" x2={notchX} y2="100"
            stroke="oklch(0.78 0.16 195 / 0.7)" strokeWidth="0.4" strokeDasharray="2,2"
          />
          <path d={tremorPath} fill="oklch(0.68 0.22 25 / 0.35)" stroke="oklch(0.68 0.22 25)"
            strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          <path d={filteredPath} fill="oklch(0.78 0.18 145 / 0.35)"
            stroke="oklch(0.78 0.18 145)" strokeWidth="0.6"
            vectorEffect="non-scaling-stroke"
            style={{ filter: "drop-shadow(0 0 2px oklch(0.78 0.18 145 / 0.6))" }} />
        </svg>
        {/* Axis ticks */}
        <div className="absolute inset-x-0 -bottom-4 flex justify-between text-[9px] text-muted-foreground font-mono px-0.5">
          {[0, 5, 10, 15, 20].map((f) => <span key={f}>{f}Hz</span>)}
        </div>
      </div>
      {freqs.length === 0 && (
        <div className="text-[10px] text-muted-foreground mt-2">
          Move the mouse over the canvas to populate the spectrum.
        </div>
      )}
    </div>
  );
}
