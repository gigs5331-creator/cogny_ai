/**
 * Offline mathematics engine.
 *
 * Pure client-side maths so Cogni can evaluate and explain supported
 * mathematics questions without any AI/API call. Used as the offline
 * grading path and as a local calculator for maths-style answers.
 */

export type MathResult = {
  value: number | string;
  steps: string[];
  kind: string;
};

const round = (n: number, dp = 6) => Number.parseFloat(n.toFixed(dp));

/* ---------------- expression evaluation (safe recursive-descent) ---------------- */

type Tok = { t: "num" | "op" | "lp" | "rp" | "fn"; v: string };

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10,
  sin: (x) => Math.sin(x), cos: (x) => Math.cos(x), tan: (x) => Math.tan(x),
  round: Math.round, floor: Math.floor, ceil: Math.ceil, exp: Math.exp,
};

function tokenize(input: string): Tok[] {
  const src = input.replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\^/g, "^");
  const tokens: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/[0-9.]/.test(c)) {
      let n = "";
      while (i < src.length && /[0-9.]/.test(src[i])) n += src[i++];
      tokens.push({ t: "num", v: n });
      continue;
    }
    if (/[a-z]/i.test(c)) {
      let name = "";
      while (i < src.length && /[a-z]/i.test(src[i])) name += src[i++];
      const lower = name.toLowerCase();
      if (lower === "pi") { tokens.push({ t: "num", v: String(Math.PI) }); continue; }
      if (lower === "e") { tokens.push({ t: "num", v: String(Math.E) }); continue; }
      if (!(lower in FUNCS)) throw new Error(`Unsupported function "${name}"`);
      tokens.push({ t: "fn", v: lower });
      continue;
    }
    if ("+-*/^%".includes(c)) { tokens.push({ t: "op", v: c }); i++; continue; }
    if (c === "(") { tokens.push({ t: "lp", v: c }); i++; continue; }
    if (c === ")") { tokens.push({ t: "rp", v: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}"`);
  }
  return tokens;
}

export function evaluateExpression(input: string): number {
  const tokens = tokenize(input);
  let pos = 0;
  const peek = () => tokens[pos];

  function parseExpr(): number {
    let left = parseTerm();
    while (peek()?.t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = tokens[pos++].v;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  function parseTerm(): number {
    let left = parsePower();
    while (peek()?.t === "op" && ["*", "/", "%"].includes(peek().v)) {
      const op = tokens[pos++].v;
      const right = parsePower();
      if (op === "*") left *= right;
      else if (op === "/") left /= right;
      else left %= right;
    }
    return left;
  }
  function parsePower(): number {
    const base = parseUnary();
    if (peek()?.t === "op" && peek().v === "^") { pos++; return base ** parsePower(); }
    return base;
  }
  function parseUnary(): number {
    if (peek()?.t === "op" && (peek().v === "-" || peek().v === "+")) {
      const op = tokens[pos++].v;
      const val = parseUnary();
      return op === "-" ? -val : val;
    }
    return parseAtom();
  }
  function parseAtom(): number {
    const tok = tokens[pos];
    if (!tok) throw new Error("Unexpected end of expression");
    if (tok.t === "num") { pos++; return Number(tok.v); }
    if (tok.t === "fn") { pos++; const arg = parseAtom(); return FUNCS[tok.v](arg); }
    if (tok.t === "lp") {
      pos++;
      const val = parseExpr();
      if (peek()?.t !== "rp") throw new Error("Missing closing bracket");
      pos++;
      return val;
    }
    throw new Error(`Unexpected token "${tok.v}"`);
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error("Could not fully parse expression");
  if (!Number.isFinite(result)) throw new Error("Result is not a finite number");
  return result;
}

/* ---------------- fractions / percentages / ratios ---------------- */

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

export function simplifyFraction(numerator: number, denominator: number): MathResult {
  const g = gcd(numerator, denominator) || 1;
  return {
    kind: "fraction",
    value: `${numerator / g}/${denominator / g}`,
    steps: [
      `Greatest common divisor of ${numerator} and ${denominator} is ${g}.`,
      `Divide both parts: ${numerator}÷${g} = ${numerator / g}, ${denominator}÷${g} = ${denominator / g}.`,
      `Simplified fraction: ${numerator / g}/${denominator / g} (= ${round(numerator / denominator, 4)}).`,
    ],
  };
}

export function percentageOf(percent: number, amount: number): MathResult {
  const value = (percent / 100) * amount;
  return {
    kind: "percentage",
    value: round(value),
    steps: [`${percent}% = ${percent}/100 = ${round(percent / 100, 4)}.`, `${round(percent / 100, 4)} × ${amount} = ${round(value)}.`],
  };
}

export function percentageChange(from: number, to: number): MathResult {
  const change = ((to - from) / from) * 100;
  return {
    kind: "percentage-change",
    value: round(change, 2),
    steps: [`Change = ${to} − ${from} = ${round(to - from)}.`, `Percentage change = ${round(to - from)} ÷ ${from} × 100 = ${round(change, 2)}%.`],
  };
}

export function simplifyRatio(parts: number[]): MathResult {
  const g = parts.reduce((a, b) => gcd(a, b));
  const simplified = parts.map((p) => p / (g || 1));
  return {
    kind: "ratio",
    value: simplified.join(":"),
    steps: [`Common divisor: ${g}.`, `Divide each part: ${simplified.join(" : ")}.`],
  };
}

/* ---------------- algebra ---------------- */

/** Solves a linear equation of the form ax + b = cx + d given as a string. */
export function solveLinearEquation(equation: string): MathResult {
  const [lhs, rhs] = equation.split("=");
  if (!lhs || !rhs) throw new Error("Equation must contain '='");
  const side = (expr: string) => {
    let a = 0;
    let b = 0;
    const cleaned = expr.replace(/\s+/g, "").replace(/-/g, "+-");
    for (const term of cleaned.split("+").filter(Boolean)) {
      if (/x/i.test(term)) {
        const coefficient = term.replace(/x/i, "");
        a += coefficient === "" || coefficient === "+" ? 1 : coefficient === "-" ? -1 : Number(coefficient);
      } else {
        b += Number(term);
      }
    }
    return { a, b };
  };
  const left = side(lhs);
  const right = side(rhs);
  const a = left.a - right.a;
  const b = right.b - left.b;
  if (a === 0) throw new Error("No unique solution for x");
  const x = b / a;
  return {
    kind: "linear-equation",
    value: round(x),
    steps: [
      `Collect x-terms: (${left.a} − ${right.a})x = ${a}x.`,
      `Collect constants: ${right.b} − ${left.b} = ${b}.`,
      `x = ${b} ÷ ${a} = ${round(x)}.`,
    ],
  };
}

export function solveQuadratic(a: number, b: number, c: number): MathResult {
  const disc = b * b - 4 * a * c;
  const steps = [`Discriminant = b² − 4ac = ${b}² − 4(${a})(${c}) = ${round(disc)}.`];
  if (disc < 0) {
    steps.push("Discriminant is negative, so there are no real roots.");
    return { kind: "quadratic", value: "no real roots", steps };
  }
  const r1 = (-b + Math.sqrt(disc)) / (2 * a);
  const r2 = (-b - Math.sqrt(disc)) / (2 * a);
  steps.push(`x = (−b ± √disc) / 2a = (${-b} ± ${round(Math.sqrt(disc), 4)}) / ${2 * a}.`);
  steps.push(`x₁ = ${round(r1, 4)}, x₂ = ${round(r2, 4)}.`);
  return { kind: "quadratic", value: disc === 0 ? round(r1, 4) : `${round(r1, 4)}, ${round(r2, 4)}`, steps };
}

/* ---------------- financial mathematics ---------------- */

export function simpleInterest(principal: number, ratePct: number, years: number): MathResult {
  const interest = (principal * ratePct * years) / 100;
  return {
    kind: "simple-interest",
    value: round(interest, 2),
    steps: [`I = P × r × t = ${principal} × ${ratePct / 100} × ${years}.`, `Interest = ${round(interest, 2)}; total = ${round(principal + interest, 2)}.`],
  };
}

export function compoundInterest(principal: number, ratePct: number, years: number, timesPerYear = 1): MathResult {
  const amount = principal * (1 + ratePct / 100 / timesPerYear) ** (timesPerYear * years);
  return {
    kind: "compound-interest",
    value: round(amount, 2),
    steps: [
      `A = P(1 + r/n)^(nt) = ${principal}(1 + ${ratePct / 100}/${timesPerYear})^(${timesPerYear}×${years}).`,
      `A = ${round(amount, 2)}; interest earned = ${round(amount - principal, 2)}.`,
    ],
  };
}

export function presentValue(futureValue: number, ratePct: number, years: number): MathResult {
  const pv = futureValue / (1 + ratePct / 100) ** years;
  return {
    kind: "present-value",
    value: round(pv, 2),
    steps: [`PV = FV / (1 + r)^t = ${futureValue} / (1 + ${ratePct / 100})^${years}.`, `PV = ${round(pv, 2)}.`],
  };
}

export function loanPayment(principal: number, annualRatePct: number, years: number): MathResult {
  const i = annualRatePct / 100 / 12;
  const n = years * 12;
  const payment = i === 0 ? principal / n : (principal * i) / (1 - (1 + i) ** -n);
  return {
    kind: "loan-payment",
    value: round(payment, 2),
    steps: [`Monthly rate i = ${annualRatePct}%/12 = ${round(i, 6)}, n = ${n} payments.`, `Payment = P·i / (1 − (1+i)⁻ⁿ) = ${round(payment, 2)} per month.`],
  };
}

/* ---------------- statistics ---------------- */

export function statistics(values: number[]): MathResult {
  const n = values.length;
  if (!n) throw new Error("No values supplied");
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const sorted = [...values].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const counts = new Map<number, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  const maxCount = Math.max(...counts.values());
  const mode = maxCount > 1 ? [...counts.entries()].filter(([, c]) => c === maxCount).map(([v]) => v) : [];
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  return {
    kind: "statistics",
    value: `mean ${round(mean, 4)}, median ${round(median, 4)}, sd ${round(sd, 4)}`,
    steps: [
      `Sum = ${round(sum, 4)}, n = ${n} → mean = ${round(mean, 4)}.`,
      `Ordered values: ${sorted.join(", ")} → median = ${round(median, 4)}.`,
      mode.length ? `Mode: ${mode.join(", ")}.` : "No mode (all values appear equally often).",
      `Variance = ${round(variance, 4)}, standard deviation = ${round(sd, 4)}.`,
      `Range = ${round(sorted[n - 1] - sorted[0], 4)}.`,
    ],
  };
}

/* ---------------- matrices ---------------- */

type Matrix = number[][];

export function matrixAdd(a: Matrix, b: Matrix): Matrix {
  return a.map((row, i) => row.map((v, j) => v + b[i][j]));
}

export function matrixMultiply(a: Matrix, b: Matrix): Matrix {
  return a.map((row) => b[0].map((_, j) => row.reduce((sum, v, k) => sum + v * b[k][j], 0)));
}

export function matrixDeterminant(m: Matrix): number {
  const n = m.length;
  if (n === 1) return m[0][0];
  if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
  return m[0].reduce((sum, v, j) => {
    const minor = m.slice(1).map((row) => row.filter((_, k) => k !== j));
    return sum + (j % 2 === 0 ? 1 : -1) * v * matrixDeterminant(minor);
  }, 0);
}

/* ---------------- graphs / coordinate geometry ---------------- */

export function lineThroughPoints(x1: number, y1: number, x2: number, y2: number): MathResult {
  if (x1 === x2) return { kind: "line", value: `x = ${x1}`, steps: ["The line is vertical, so the gradient is undefined."] };
  const gradient = (y2 - y1) / (x2 - x1);
  const intercept = y1 - gradient * x1;
  return {
    kind: "line",
    value: `y = ${round(gradient, 4)}x ${intercept >= 0 ? "+" : "−"} ${Math.abs(round(intercept, 4))}`,
    steps: [
      `Gradient m = (y₂ − y₁)/(x₂ − x₁) = (${y2} − ${y1})/(${x2} − ${x1}) = ${round(gradient, 4)}.`,
      `Intercept c = y₁ − m·x₁ = ${y1} − ${round(gradient, 4)}×${x1} = ${round(intercept, 4)}.`,
      `Distance between points = ${round(Math.hypot(x2 - x1, y2 - y1), 4)}.`,
    ],
  };
}

/* ---------------- question solver used by offline grading ---------------- */

const NUMBERS = (text: string) => (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

/**
 * Attempts to solve a natural-language maths question fully offline.
 * Returns null when the question is outside the engine's supported scope.
 */
export function solveMathQuestion(question: string): MathResult | null {
  const q = question.toLowerCase();
  const nums = NUMBERS(question);

  try {
    if (/simple interest/.test(q) && nums.length >= 3) return simpleInterest(nums[0], nums[1], nums[2]);
    if (/compound interest|compounded/.test(q) && nums.length >= 3) return compoundInterest(nums[0], nums[1], nums[2]);
    if (/present value|discount(ed)? value/.test(q) && nums.length >= 3) return presentValue(nums[0], nums[1], nums[2]);
    if (/(monthly (re)?payment|instal?ment|loan|bond|mortgage)/.test(q) && nums.length >= 3) return loanPayment(nums[0], nums[1], nums[2]);
    if (/(mean|average|median|standard deviation|variance|mode)/.test(q) && nums.length >= 2) return statistics(nums);
    if (/determinant/.test(q)) {
      const rows = question.match(/\[([^\]]+)\]/g);
      if (rows && rows.length >= 2) {
        const m = rows.map((r) => NUMBERS(r));
        return { kind: "determinant", value: round(matrixDeterminant(m), 4), steps: [`Determinant of the given ${m.length}×${m[0].length} matrix = ${round(matrixDeterminant(m), 4)}.`] };
      }
    }
    if (/(gradient|slope|equation of the line)/.test(q) && nums.length >= 4) return lineThroughPoints(nums[0], nums[1], nums[2], nums[3]);
    if (/simplify.*ratio|ratio.*simplest/.test(q) && nums.length >= 2) return simplifyRatio(nums);
    if (/percentage (increase|decrease|change)|increase(d)? from|decrease(d)? from/.test(q) && nums.length >= 2) return percentageChange(nums[0], nums[1]);
    if (/%\s*of|percent of/.test(q) && nums.length >= 2) return percentageOf(nums[0], nums[1]);
    if (/simplify.*fraction/.test(q) && nums.length >= 2) return simplifyFraction(nums[0], nums[1]);
    const quad = q.match(/(-?\d*)x\s*\^?2\s*([+-]\s*\d*)x\s*([+-]\s*\d+)\s*=\s*0/);
    if (quad) {
      const coefficient = (raw: string, fallback: number) => {
        const cleaned = raw.replace(/\s+/g, "");
        if (cleaned === "" || cleaned === "+") return fallback;
        if (cleaned === "-") return -fallback;
        return Number(cleaned);
      };
      return solveQuadratic(coefficient(quad[1], 1), coefficient(quad[2], 1), Number(quad[3].replace(/\s+/g, "")));
    }
    if (/=/.test(question) && /x/i.test(question) && /solve|find x|value of x/.test(q)) {
      const eq = question.match(/[-+0-9x*/.\s]+=[-+0-9x*/.\s]+/i);
      if (eq) return solveLinearEquation(eq[0]);
    }
    const expr = question.match(/[-+0-9.()^*/×÷\s]{3,}/);
    if (expr && /[+\-*/^×÷]/.test(expr[0]) && /\d/.test(expr[0])) {
      const value = evaluateExpression(expr[0]);
      return { kind: "arithmetic", value: round(value, 6), steps: [`Evaluate ${expr[0].trim()} = ${round(value, 6)}.`] };
    }
  } catch {
    return null;
  }
  return null;
}

/** Compares a student's answer to the expected answer using local maths only. */
export function offlineMathCheck(question: string, expected: string, userAnswer: string): { correct: boolean; feedback: string } | null {
  const expectedNum = Number((expected.match(/-?\d+(?:\.\d+)?/) ?? [])[0]);
  const userNum = Number((userAnswer.match(/-?\d+(?:\.\d+)?/) ?? [])[0]);
  if (!Number.isFinite(expectedNum) || !Number.isFinite(userNum)) return null;
  const tolerance = Math.max(0.01, Math.abs(expectedNum) * 0.01);
  const correct = Math.abs(expectedNum - userNum) <= tolerance;
  const solved = solveMathQuestion(question);
  const workings = solved?.steps.length ? ` Working: ${solved.steps.join(" ")}` : "";
  return {
    correct,
    feedback: correct
      ? `Correct — checked offline by Cogni's maths engine.${workings}`
      : `Not quite — the expected value is ${expected}.${workings}`,
  };
}
