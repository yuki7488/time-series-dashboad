import Papa from "papaparse";
import { z } from "zod";

export const CsvRowSchema = z.object({
  date: z.string().min(1),
  value: z.coerce.number(),
});
export type CsvRow = z.infer<typeof CsvRowSchema>;

type RawRow = Record<string, unknown>;

export function parseCsv(content: string): CsvRow[] {
  const parsed = Papa.parse<RawRow>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((e) => e.message).join(", "));
  }
  const rows: CsvRow[] = [];
  for (const row of parsed.data) {
    const result = CsvRowSchema.safeParse({
      date: (row as RawRow)["date"] ?? (row as RawRow)["ds"] ?? (row as RawRow)["timestamp"] ?? (row as RawRow)["time"] ?? (row as RawRow)["Date"] ?? (row as RawRow)["DS"],
      value: (row as RawRow)["value"] ?? (row as RawRow)["y"] ?? (row as RawRow)["target"] ?? (row as RawRow)["Value"] ?? (row as RawRow)["Y"],
    });
    if (result.success) rows.push(result.data);
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


