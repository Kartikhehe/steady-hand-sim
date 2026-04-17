// DSP primitives: PID controller, biquad notch filter, tremor source, FFT.
// All operate sample-by-sample at a fixed sampleRate.

export class PIDController {
  kp: number;
  ki: number;
  kd: number;
  private integ = 0;
  private prevErr = 0;
  private dt: number;

  constructor(kp: number, ki: number, kd: number, sampleRate: number) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
    this.dt = 1 / sampleRate;
  }

  reset() {
    this.integ = 0;
    this.prevErr = 0;
  }

  setGains(kp: number, ki: number, kd: number) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
  }

  // Tracks setpoint by integrating control output as velocity correction.
  // Returns the corrected position estimate.
  update(setpoint: number, measured: number): number {
    const err = setpoint - measured;
    this.integ += err * this.dt;
    // Anti-windup clamp
    if (this.integ > 1e4) this.integ = 1e4;
    if (this.integ < -1e4) this.integ = -1e4;
    const deriv = (err - this.prevErr) / this.dt;
    this.prevErr = err;
    const u = this.kp * err + this.ki * this.integ + this.kd * deriv;
    // Treat control output as additive correction to measured signal
    return measured + u * this.dt;
  }
}

// Second-order IIR notch filter via bilinear transform.
// H(s) = (s^2 + wn^2) / (s^2 + 2*zeta*wn*s + wn^2)
export class NotchFilter {
  private b0 = 1; private b1 = 0; private b2 = 0;
  private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  private fs: number;

  constructor(centerHz: number, zeta: number, sampleRate: number) {
    this.fs = sampleRate;
    this.design(centerHz, zeta);
  }

  reset() {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }

  design(centerHz: number, zeta: number) {
    const f = Math.max(0.5, Math.min(centerHz, this.fs / 2 - 1));
    const z = Math.max(0.005, zeta);
    // Pre-warped angular frequency
    const w0 = 2 * Math.PI * f;
    const T = 1 / this.fs;
    const K = 2 / T;
    const K2 = K * K;
    const w02 = w0 * w0;

    // Numerator: s^2 + w0^2
    const nb0 = K2 + w02;
    const nb1 = 2 * (w02 - K2);
    const nb2 = K2 + w02;

    // Denominator: s^2 + 2*z*w0*s + w0^2
    const da0 = K2 + 2 * z * w0 * K + w02;
    const da1 = 2 * (w02 - K2);
    const da2 = K2 - 2 * z * w0 * K + w02;

    this.b0 = nb0 / da0;
    this.b1 = nb1 / da0;
    this.b2 = nb2 / da0;
    this.a1 = da1 / da0;
    this.a2 = da2 / da0;
  }

  process(x: number): number {
    const y =
      this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 -
      this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

export class TremorSource {
  amplitude: number; // pixels
  freq: number;      // Hz
  noise: number;     // pixels
  private phaseX = Math.random() * Math.PI * 2;
  private phaseY = Math.random() * Math.PI * 2;

  constructor(amplitude: number, freq: number, noise: number) {
    this.amplitude = amplitude;
    this.freq = freq;
    this.noise = noise;
  }

  sample(t: number): { dx: number; dy: number } {
    const w = 2 * Math.PI * this.freq;
    const dx =
      this.amplitude * Math.sin(w * t + this.phaseX) +
      (Math.random() - 0.5) * 2 * this.noise;
    const dy =
      this.amplitude * Math.cos(w * t + this.phaseY) +
      (Math.random() - 0.5) * 2 * this.noise;
    return { dx, dy };
  }
}

// Naive O(N^2) DFT magnitude for small N (N<=256). Returns magnitudes[0..N/2].
export function dftMagnitude(samples: number[]): number[] {
  const N = samples.length;
  // Remove DC
  let mean = 0;
  for (let i = 0; i < N; i++) mean += samples[i];
  mean /= N;
  const out = new Array(Math.floor(N / 2));
  for (let k = 0; k < out.length; k++) {
    let re = 0, im = 0;
    const c = (-2 * Math.PI * k) / N;
    for (let n = 0; n < N; n++) {
      const v = samples[n] - mean;
      re += v * Math.cos(c * n);
      im += v * Math.sin(c * n);
    }
    out[k] = Math.sqrt(re * re + im * im) / N;
  }
  return out;
}

export function rms(values: number[]): number {
  if (!values.length) return 0;
  let s = 0;
  for (const v of values) s += v * v;
  return Math.sqrt(s / values.length);
}

export function maxAbs(values: number[]): number {
  let m = 0;
  for (const v of values) if (Math.abs(v) > m) m = Math.abs(v);
  return m;
}
