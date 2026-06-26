/**
 * Diff — compute line-level diffs between two strings.
 * Uses a simple LCS-based algorithm to produce an array of
 * { type: "add" | "remove" | "keep", value: string } operations.
 *
 * This is intentionally a standalone module with no external deps.
 * No need for `diff` npm package.
 */

export interface DiffOp {
  type: "add" | "remove" | "keep";
  value: string;
}

/**
 * Compute a line-level diff between two strings.
 */
export function computeDiff(a: string, b: string): DiffOp[] {
  const linesA = a.split("\n");
  const linesB = b.split("\n");

  // Build LCS table
  const m = linesA.length;
  const n = linesB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff ops
  const result: DiffOp[] = [];
  let i = m, j = n;
  const temp: DiffOp[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      temp.push({ type: "keep", value: linesA[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      temp.push({ type: "add", value: linesB[j - 1] });
      j--;
    } else if (i > 0) {
      temp.push({ type: "remove", value: linesA[i - 1] });
      i--;
    }
  }

  // Reverse to get chronological order
  for (let k = temp.length - 1; k >= 0; k--) {
    result.push(temp[k]);
  }

  // Collapse consecutive same-type ops into multi-line blocks
  // for cleaner rendering
  return collapseDiff(result);
}

function collapseDiff(ops: DiffOp[]): DiffOp[] {
  if (ops.length === 0) return [];
  const result: DiffOp[] = [];
  let current = { ...ops[0] };

  for (let k = 1; k < ops.length; k++) {
    const op = ops[k];
    if (op.type === current.type) {
      current.value += "\n" + op.value;
    } else {
      result.push(current);
      current = { ...op };
    }
  }
  result.push(current);
  return result;
}

/**
 * Apply a set of diff ops to reconstruct the target string.
 * Useful for testing.
 */
export function applyDiff(a: string, ops: DiffOp[]): string {
  const linesA = a.split("\n");
  const result: string[] = [];
  let ai = 0;

  for (const op of ops) {
    if (op.type === "keep") {
      result.push(op.value);
      ai += op.value.split("\n").length;
    } else if (op.type === "remove") {
      // Skip removed lines in A
      const count = op.value.split("\n").length;
      ai += count;
    } else if (op.type === "add") {
      result.push(op.value);
    }
  }

  return result.join("\n");
}
