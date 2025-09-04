import Papa from "papaparse";
import { z } from "zod";

export const CsvRowSchema = z.object({
  date: z.string().min(1),
  value: z.coerce.number(),
});
export type CsvRow = z.infer<typeof CsvRowSchema>;

type RawRow = Record<string, unknown>;

function tryParseHeaderless(content: string): CsvRow[] | null {
  const parsed = Papa.parse<string[]>(content, { header: false, skipEmptyLines: true });
  if (!Array.isArray(parsed.data) || parsed.data.length === 0) return null;
  const rowsArr = parsed.data as unknown as string[][];
  const colCount = rowsArr.reduce((m, r) => Math.max(m, r.length), 0);
  if (colCount === 0) return null;
  const n = rowsArr.length;
  const isDateLike = (v: string) => {
    const d = new Date(v);
    return Number.isFinite(d.getTime());
  };
  const dateScores: number[] = Array(colCount).fill(0);
  const numScores: number[] = Array(colCount).fill(0);
  for (let c = 0; c < colCount; c += 1) {
    let dOK = 0;
    let nOK = 0;
    for (let i = 0; i < n; i += 1) {
      const cell = rowsArr[i][c] ?? "";
      if (isDateLike(cell)) dOK += 1;
      const num = Number(cell);
      if (Number.isFinite(num) && cell.trim() !== "") nOK += 1;
    }
    dateScores[c] = dOK / n;
    numScores[c] = nOK / n;
  }
  let dateIdx = dateScores.indexOf(Math.max(...dateScores));
  if (!Number.isFinite(dateScores[dateIdx]) || dateScores[dateIdx] === 0) dateIdx = 0;
  let valueIdx = numScores.indexOf(Math.max(...numScores));
  if (valueIdx === dateIdx) {
    const sorted = numScores
      .map((s, idx) => ({ s, idx }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.idx);
    valueIdx = sorted.find((i) => i !== dateIdx) ?? Math.min(1, colCount - 1);
  }
  const out: CsvRow[] = [];
  for (const r of rowsArr) {
    const d = r[dateIdx];
    const v = r[valueIdx];
    const parsedOne = CsvRowSchema.safeParse({ date: d, value: v });
    if (parsedOne.success) out.push(parsedOne.data);
  }
  return out.length > 0 ? out : null;
}

export function parseCsv(content: string): CsvRow[] {
  const parsed = Papa.parse<RawRow>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const rows: CsvRow[] = [];
  if (Array.isArray(parsed.data) && parsed.data.length > 0) {
    for (const row of parsed.data) {
      const result = CsvRowSchema.safeParse({
        date:
          (row as RawRow)["date"] ??
          (row as RawRow)["ds"] ??
          (row as RawRow)["timestamp"] ??
          (row as RawRow)["time"] ??
          (row as RawRow)["Date"] ??
          (row as RawRow)["DS"],
        value:
          (row as RawRow)["value"] ??
          (row as RawRow)["y"] ??
          (row as RawRow)["target"] ??
          (row as RawRow)["Value"] ??
          (row as RawRow)["Y"],
      });
      if (result.success) rows.push(result.data);
    }
  }
  const tooManyFields = parsed.errors.some((e) => /Too many fields/i.test(e.message));
  if (rows.length === 0 || tooManyFields) {
    const fallback = tryParseHeaderless(content);
    if (fallback && fallback.length > 0) return fallback;
  }
  if (parsed.errors.length > 0 && rows.length === 0) {
    throw new Error(parsed.errors.map((e) => e.message).join(", "));
  }
  return rows;
}

export function toSeries(rows: CsvRow[]): { datesISO: string[]; values: number[] } {
  const cleaned = rows
    .map((r) => ({ ...r, date: new Date(r.date) }))
    .filter((r) => !Number.isNaN(r.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const datesISO = cleaned.map((r) => r.date.toISOString());
  const values = cleaned.map((r) => r.value);
  return { datesISO, values };
}


