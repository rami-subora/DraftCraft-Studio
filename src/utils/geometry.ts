import type { Point } from '../store/useStore';

export function getPolygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    let j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
}

export function getPolylineLength(points: Point[]): number {
  if (points.length < 2) return 0;
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    length += Math.hypot(points[i+1].x - points[i].x, points[i+1].y - points[i].y);
  }
  return length;
}

export function pointInPolygon(point: Point, vs: Point[]): boolean {
  let x = point.x, y = point.y;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let xi = vs[i].x, yi = vs[i].y;
    let xj = vs[j].x, yj = vs[j].y;
    let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegmentSquared(p: Point, v: Point, w: Point): { dist2: number, proj: Point } {
  const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
  if (l2 === 0) return { dist2: Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2), proj: v };
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
  return { dist2: Math.pow(p.x - proj.x, 2) + Math.pow(p.y - proj.y, 2), proj };
}

export function getSnapTarget(currentPos: Point, layers: { id: string, points: Point[], type: string }[], threshold: number): Point | null {
  let bestSnap: Point | null = null;
  let minDistance2 = threshold * threshold;

  layers.forEach(layer => {
    if (['polygon', 'polyline', 'boundary', 'rect', 'deduction'].includes(layer.type)) {
      // Check vertices
      layer.points.forEach(p => {
        const d2 = Math.pow(p.x - currentPos.x, 2) + Math.pow(p.y - currentPos.y, 2);
        if (d2 < minDistance2) {
          minDistance2 = d2;
          bestSnap = { x: p.x, y: p.y };
        }
      });

      // Check edges
      for (let i = 0; i < layer.points.length; i++) {
        let j = (i + 1) % layer.points.length;
        if (layer.type === 'polyline' && j === 0) continue; // Don't check closing segment for polylines
        const { dist2, proj } = distToSegmentSquared(currentPos, layer.points[i], layer.points[j]);
        if (dist2 < minDistance2) {
          minDistance2 = dist2;
          bestSnap = proj;
        }
      }
    }
  });

  return bestSnap;
}
