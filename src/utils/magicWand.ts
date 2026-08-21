import type { Point } from '../store/useStore';

// ─── Flood Fill ──────────────────────────────────────────────────────────────

function colorDistance(data: Uint8ClampedArray, i1: number, i2: number): number {
  const dr = data[i1] - data[i2];
  const dg = data[i1 + 1] - data[i2 + 1];
  const db = data[i1 + 2] - data[i2 + 2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Flood fills from (startX, startY) within the given tolerance.
 * Returns a Uint8Array bitmask where 1 = filled pixel.
 */
export function floodFill(
  imageData: ImageData,
  startX: number,
  startY: number,
  tolerance: number
): Uint8Array {
  const { data, width, height } = imageData;
  const mask = new Uint8Array(width * height);
  const stack: number[] = [];

  const clampX = Math.max(0, Math.min(width - 1, Math.round(startX)));
  const clampY = Math.max(0, Math.min(height - 1, Math.round(startY)));
  const startIdx = (clampY * width + clampX) * 4;

  stack.push(clampY * width + clampX);
  mask[clampY * width + clampX] = 1;

  while (stack.length > 0) {
    const idx = stack.pop()!;
    const x = idx % width;
    const y = (idx - x) / width;
    const neighbors = [
      { nx: x - 1, ny: y },
      { nx: x + 1, ny: y },
      { nx: x, ny: y - 1 },
      { nx: x, ny: y + 1 },
    ];

    for (const { nx, ny } of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (mask[nIdx]) continue;
      const nPixelIdx = nIdx * 4;
      if (colorDistance(data, startIdx, nPixelIdx) <= tolerance) {
        mask[nIdx] = 1;
        stack.push(nIdx);
      }
    }
  }

  return mask;
}

// ─── Contour Tracing ─────────────────────────────────────────────────────────

/**
 * Traces the outer boundary of a bitmask using a simple border-following algorithm.
 * Returns a list of (x, y) points in pixel space.
 */
export function traceContour(mask: Uint8Array, width: number, height: number): Point[] {
  // Find start pixel: first filled pixel scanning top-left
  let startX = -1, startY = -1;
  outer:
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }
  if (startX === -1) return [];

  // Moore neighborhood border tracing (Jacob's stopping criterion)
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  const isFilled = (x: number, y: number) =>
    x >= 0 && x < width && y >= 0 && y < height && mask[y * width + x] === 1;

  const boundary: Point[] = [];
  let cx = startX, cy = startY;
  let prevDir = 7; // start by looking from the left

  // Find the first empty neighbor to initialize direction
  for (let d = 0; d < 8; d++) {
    const dir = (prevDir + d) % 8;
    if (!isFilled(cx + dx[dir], cy + dy[dir])) {
      prevDir = dir;
      break;
    }
  }

  let steps = 0;
  const maxSteps = width * height; // safety

  do {
    boundary.push({ x: cx, y: cy });

    // Step: look from the direction we came from, clockwise
    let found = false;
    const lookStart = (prevDir + 5) % 8; // backtrack direction + 1 clockwise step
    for (let d = 0; d < 8; d++) {
      const dir = (lookStart + d) % 8;
      const nx = cx + dx[dir];
      const ny = cy + dy[dir];
      if (isFilled(nx, ny)) {
        prevDir = dir;
        cx = nx;
        cy = ny;
        found = true;
        break;
      }
    }
    if (!found) break;
    steps++;
  } while ((cx !== startX || cy !== startY) && steps < maxSteps);

  return boundary;
}

// ─── Polygon Simplification (Ramer-Douglas-Peucker) ──────────────────────────

function perpendicularDistance(p: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - lineStart.x, p.y - lineStart.y);
  const len = Math.sqrt(dx * dx + dy * dy);
  return Math.abs(dy * p.x - dx * p.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / len;
}

export function simplifyPolygon(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPolygon(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPolygon(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[end]];
}

// ─── Main entry ──────────────────────────────────────────────────────────────

/**
 * Given an HTMLImageElement and a click point in image pixel coordinates,
 * performs a magic wand selection and returns simplified polygon points.
 */
export function magicWandTrace(
  imgEl: HTMLImageElement,
  clickX: number,
  clickY: number,
  tolerance: number,
  simplifyEpsilon = 3
): Point[] {
  // Draw image to an offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = imgEl.naturalWidth || imgEl.width;
  canvas.height = imgEl.naturalHeight || imgEl.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const mask = floodFill(imageData, clickX, clickY, tolerance);
  const contour = traceContour(mask, canvas.width, canvas.height);
  const simplified = simplifyPolygon(contour, simplifyEpsilon);

  return simplified;
}
