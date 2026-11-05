'use strict';
// Line diff (LCS) returning hunks with line numbers in the new file.
function lineDiff(a, b) {
  const A = a.split('\n'); const B = b.split('\n');
  const n = A.length; const m = B.length;
  if (n * m > 4e6) { // too large for LCS; fall back to set difference
    const sa = new Set(A); const sb = new Set(B);
    return [...A.map((l, i) => ({ op: '-', line: i + 1, text: l })).filter((x) => !sb.has(x.text)),
      ...B.map((l, i) => ({ op: '+', line: i + 1, text: l })).filter((x) => !sa.has(x.text))];
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0; let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { i++; j++; }
    else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { out.push({ op: '+', line: j + 1, text: B[j] }); j++; }
    else { out.push({ op: '-', line: i + 1, text: A[i] }); i++; }
  }
  return out;
}
module.exports = { lineDiff };
