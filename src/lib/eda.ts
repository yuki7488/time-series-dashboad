import { parseISO, formatISO } from "date-fns";

export type Frequency = "D" | "M";

export interface ColumnRoles {
  date: string;
  value: string;
  product?: string;
}

export interface EdaRow {
  // Arbitrary source row with dynamic keys
  [key: string]: string | number | null | undefined;
}

export function guessColumns(headers: string[]): ColumnRoles {
  const lower = headers.map((h) => h.toLowerCase());
  const find = (...cands: string[]) => headers[lower.findIndex((h) => cands.some((c) => h.includes(c)))] ?? headers[0];
  const date = find("date", "time", "日", "timestamp", "ds", "受注日", "注文日", "発注日");
  const product = headers[lower.findIndex((h) => ["product", "item", "品", "sku", "商品名"].some((c) => h.includes(c)))] ?? undefined;
  const numericCandidates = headers.filter((h) => ![date, product].includes(h));
  // default to a column named value/y/qty/quantity if exists
  const value =
    headers[lower.findIndex((h) => ["value", "y", "qty", "quantity", "target", "量", "数", "数量(kg)", "数量", "kg"].some((c) => h.includes(c)))] ??
    (numericCandidates[0] ?? headers[0]);
  return { date, value, product };
}

export function summarizeMissing(rows: EdaRow[], columns: string[]): { column: string; missing_count: number; missing_pct: number }[] {
  const n = rows.length;
  return columns.map((col) => {
    const missing = rows.reduce((acc, r) => (r[col] === null || r[col] === undefined || r[col] === "" ? acc + 1 : acc), 0);
    return { column: col, missing_count: missing, missing_pct: n === 0 ? 0 : Math.round((missing / n) * 10000) / 100 };
  }).sort((a, b) => b.missing_count - a.missing_count);
}

function toISODateOnly(d: Date): string {
  return formatISO(d, { representation: "date" });
}

function ensureDate(value: string | number | Date): Date | null {
  try {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === "number") return new Date(value);
    return parseISO(String(value));
  } catch {
    return null;
  }
}

export function aggregateTimeseries(
  rows: EdaRow[],
  roles: ColumnRoles,
  freq: Frequency,
  productsFilter?: string[]
): { labels: string[]; seriesByKey: Record<string, number[]> } {
  // Build map: key -> dateKey -> sum
  const byKey: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const rawDate = r[roles.date];
    const rawValue = r[roles.value];
    const product = roles.product ? String(r[roles.product] ?? "(ALL)") : "(ALL)";
    if (productsFilter && roles.product && productsFilter.length > 0 && !productsFilter.includes(product)) continue;
    const dt = rawDate !== undefined ? ensureDate(String(rawDate)) : null;
    const val = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (!dt || !Number.isFinite(val)) continue;
    let bucket: string;
    if (freq === "D") {
      bucket = toISODateOnly(dt);
    } else {
      const y = dt.getUTCFullYear();
      const m = dt.getUTCMonth() + 1;
      bucket = `${y}-${String(m).padStart(2, "0")}`;
    }
    const key = roles.product ? product : "(TOTAL)";
    byKey[key] = byKey[key] ?? {};
    byKey[key][bucket] = (byKey[key][bucket] ?? 0) + val;
  }

  // Collect union of labels
  const labelSet = new Set<string>();
  Object.values(byKey).forEach((m) => Object.keys(m).forEach((k) => labelSet.add(k)));
  const labels = Array.from(labelSet).sort();

  const seriesByKey: Record<string, number[]> = {};
  for (const [key, m] of Object.entries(byKey)) {
    seriesByKey[key] = labels.map((lb) => m[lb] ?? 0);
  }
  return { labels, seriesByKey };
}

export function movingAverage(values: number[], window: number): number[] {
  const w = Math.max(1, Math.floor(window));
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const start = Math.max(0, i - w + 1);
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    out.push(avg);
  }
  return out;
}

export function autocorrelation(values: number[], lag: number): number {
  const n = values.length;
  if (lag <= 0 || lag >= n) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const diff = values[i] - mean;
    den += diff * diff;
  }
  for (let i = lag; i < n; i += 1) {
    num += (values[i] - mean) * (values[i - lag] - mean);
  }
  return den === 0 ? 0 : num / den;
}

export function autoDetectPeriod(labels: string[], values: number[], freq: Frequency): { best: number; table: { period: number; score: number }[] } {
  const n = values.length;
  const candidatesByFreq: Record<Frequency, number[]> = {
    D: [7, 14, 30, 60, 90, 180, 365],
    M: [6, 12, 24, 36],
  };
  const cands = candidatesByFreq[freq].filter((p) => p >= 2 && p <= Math.max(2, Math.floor(n / 2)));
  const table = cands.map((p) => ({ period: p, score: Math.max(0, autocorrelation(values, p)) }))
    .sort((a, b) => b.score - a.score);
  const best = table.length > 0 ? table[0].period : Math.max(2, Math.min(7, Math.floor(n / 4)));
  return { best, table };
}

export function weekdayAverages(datesISO: string[], values: number[]): { labels: string[]; averages: number[] } {
  const sums = Array(7).fill(0);
  const counts = Array(7).fill(0);
  for (let i = 0; i < datesISO.length; i += 1) {
    const d = new Date(datesISO[i]);
    const dow = (d.getUTCDay() + 6) % 7; // make Monday=0 .. Sunday=6
    sums[dow] += values[i] ?? 0;
    counts[dow] += 1;
  }
  const labels = ["月", "火", "水", "木", "金", "土", "日"];
  const averages = sums.map((s, i) => (counts[i] === 0 ? 0 : s / counts[i]));
  return { labels, averages };
}

export function monthlyProfile(labels: string[], values: number[]): { month: number; qty: number; diff_pct: number }[] {
  // labels in YYYY-MM or YYYY-MM-DD
  const byMonth: Record<number, number[]> = {};
  for (let i = 0; i < labels.length; i += 1) {
    const lb = labels[i];
    const dt = parseISO(lb.length === 7 ? `${lb}-01` : lb);
    const m = dt.getUTCMonth() + 1; // 1..12
    byMonth[m] = byMonth[m] ?? [];
    byMonth[m].push(values[i] ?? 0);
  }
  const monthAvg: Record<number, number> = {};
  for (let m = 1; m <= 12; m += 1) {
    const arr = byMonth[m] ?? [];
    monthAvg[m] = arr.length === 0 ? NaN : arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  const baseVals = Object.values(monthAvg).filter((v) => Number.isFinite(v));
  const base = baseVals.length === 0 ? 1 : baseVals.reduce((a, b) => a + b, 0) / baseVals.length;
  const rows: { month: number; qty: number; diff_pct: number }[] = [];
  for (let m = 1; m <= 12; m += 1) {
    const qty = monthAvg[m];
    const diffPct = Number.isFinite(qty) && base !== 0 ? ((qty as number) / base - 1) * 100 : 0;
    rows.push({ month: m, qty: Number.isFinite(qty) ? (qty as number) : 0, diff_pct: Math.round(diffPct * 10) / 10 });
  }
  return rows;
}


