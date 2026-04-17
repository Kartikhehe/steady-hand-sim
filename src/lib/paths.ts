export type PathKind = "line" | "circle" | "sine";

export interface PathPoint { x: number; y: number; }

export function generatePath(kind: PathKind, w: number, h: number, samples = 400): PathPoint[] {
  const pts: PathPoint[] = [];
  const cx = w / 2, cy = h / 2;
  if (kind === "line") {
    const x0 = w * 0.12, x1 = w * 0.88;
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      pts.push({ x: x0 + (x1 - x0) * t, y: cy });
    }
  } else if (kind === "circle") {
    const r = Math.min(w, h) * 0.32;
    for (let i = 0; i < samples; i++) {
      const t = (i / (samples - 1)) * Math.PI * 2;
      pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
    }
  } else {
    const x0 = w * 0.1, x1 = w * 0.9;
    const amp = h * 0.18;
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const x = x0 + (x1 - x0) * t;
      pts.push({ x, y: cy + amp * Math.sin(t * Math.PI * 4) });
    }
  }
  return pts;
}

// Closest distance from p to polyline pts
export function distanceToPath(pts: PathPoint[], px: number, py: number): number {
  let min = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * dx, cy = a.y + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    if (d < min) min = d;
  }
  return min;
}
