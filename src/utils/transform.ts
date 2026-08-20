// Solves Ax = B using Gaussian elimination
function solve(A: number[][], B: number[]) {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    let maxEl = Math.abs(A[i][i]), maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > maxEl) {
        maxEl = Math.abs(A[k][i]);
        maxRow = k;
      }
    }
    for (let k = i; k < n; k++) {
      const tmp = A[maxRow][k];
      A[maxRow][k] = A[i][k];
      A[i][k] = tmp;
    }
    const tmp2 = B[maxRow];
    B[maxRow] = B[i];
    B[i] = tmp2;
    for (let k = i + 1; k < n; k++) {
      const c = -A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        if (i === j) A[k][j] = 0;
        else A[k][j] += c * A[i][j];
      }
      B[k] += c * B[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = B[i] / A[i][i];
    for (let k = i - 1; k >= 0; k--) {
      B[k] -= A[k][i] * x[i];
    }
  }
  return x;
}

export function createPerspectiveTransform(dst: number[], src: number[]) {
  const A = [];
  const B = [];
  for (let i = 0; i < 4; i++) {
    A.push([
      dst[i * 2], dst[i * 2 + 1], 1, 
      0, 0, 0, 
      -dst[i * 2] * src[i * 2], -dst[i * 2 + 1] * src[i * 2]
    ]);
    B.push(src[i * 2]);
    A.push([
      0, 0, 0, 
      dst[i * 2], dst[i * 2 + 1], 1, 
      -dst[i * 2] * src[i * 2 + 1], -dst[i * 2 + 1] * src[i * 2 + 1]
    ]);
    B.push(src[i * 2 + 1]);
  }
  const h = solve(A, B);
  return {
    transform: (x: number, y: number) => {
      const w = h[6] * x + h[7] * y + 1;
      return [
        (h[0] * x + h[1] * y + h[2]) / w,
        (h[3] * x + h[4] * y + h[5]) / w
      ];
    }
  };
}
