"use client";

import { useMemo, useRef, useState } from "react";
import { parseCsv, toSeries, type CsvRow } from "@/lib/csv";
import { guessColumns, summarizeMissing, aggregateTimeseries, movingAverage, autoDetectPeriod, weekdayAverages, monthlyProfile, type ColumnRoles, type EdaRow } from "@/lib/eda";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  BarElement,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement);

type RawRow = Record<string, unknown>;

export default function AdvancedEDA() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<ColumnRoles | null>(null);
  const [maWindow, setMaWindow] = useState<number>(7);

  const { datesISO, values } = useMemo(() => toSeries(rows), [rows]);

  const headers = useMemo(() => (rawRows[0] ? Object.keys(rawRows[0]) : []), [rawRows]);

  const edaRows: EdaRow[] = useMemo(() => {
    return rawRows.map((r) => {
      const out: EdaRow = {};
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === "string" || typeof v === "number" || v == null) {
          out[k] = v as string | number | null | undefined;
        } else {
          out[k] = String(v);
        }
      }
      return out;
    });
  }, [rawRows]);

  const missing = useMemo(() => summarizeMissing(edaRows, headers), [edaRows, headers]);

  const tsDaily = useMemo(() => {
    if (!roles) return null;
    return aggregateTimeseries(edaRows, roles, "D");
  }, [edaRows, roles]);

  const period = useMemo(() => {
    if (!tsDaily) return null;
    const totalKey = Object.keys(tsDaily.seriesByKey)[0];
    const vals = tsDaily.seriesByKey[totalKey] ?? [];
    return autoDetectPeriod(tsDaily.labels, vals, "D");
  }, [tsDaily]);

  function onClickUpload() {
    inputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content = String(reader.result ?? "");
        const needsHeader = !/date|ds|timestamp|time/i.test(content.split(/\r?\n/)[0] ?? "");
        const withHeader = needsHeader ? `date,value\n${content}` : content;
        const parsed = parseCsv(withHeader);
        if (parsed.length === 0) {
          setError("CSVに有効な行がありません。(必要列: date,value)");
          return;
        }
        setRows(parsed);
        setError(null);
        // raw rows for EDA
        const csvLines = withHeader.split(/\r?\n/).filter(Boolean);
        const hdr = csvLines[0].split(",");
        const body = csvLines.slice(1).map((l) => l.split(","));
        const raw: RawRow[] = body.map((arr) => {
          const o: RawRow = {};
          hdr.forEach((h, i) => {
            const v = arr[i] ?? "";
            const num = Number(v);
            o[h] = Number.isFinite(num) && v.trim() !== "" ? num : v;
          });
          return o;
        });
        setRawRows(raw);
        const guessed = guessColumns(hdr);
        setRoles(guessed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "CSV parse error");
      }
    };
    reader.readAsText(file);
  }

  const maData = useMemo(() => movingAverage(values, maWindow), [values, maWindow]);

  const weekday = useMemo(() => weekdayAverages(datesISO, values), [datesISO, values]);

  const monthProfile = useMemo(() => {
    if (!tsDaily) return null;
    const totalKey = Object.keys(tsDaily.seriesByKey)[0];
    const vals = tsDaily.seriesByKey[totalKey] ?? [];
    return monthlyProfile(tsDaily.labels, vals);
  }, [tsDaily]);

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="block text-sm mb-1">CSVアップロード</label>
          <div className="flex gap-2">
            <button type="button" className="px-4 py-2 rounded bg-foreground text-background" onClick={onClickUpload}>
              ファイルを選択
            </button>
            <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
            <div className="flex items-center gap-2">
              <span className="text-sm">移動平均</span>
              <input
                type="number"
                className="border px-3 py-2 rounded w-24 bg-transparent"
                min={1}
                max={180}
                value={maWindow}
                onChange={(e) => setMaWindow(parseInt(e.target.value || "7", 10))}
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 text-red-500 text-sm">{error}</div>
      )}

      {/* 基本統計・欠損 */}
      {headers.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-2">欠損サマリ</h3>
          <div className="overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-white/5">
                  <th className="text-left p-2">column</th>
                  <th className="text-right p-2">missing_count</th>
                  <th className="text-right p-2">missing_pct</th>
                </tr>
              </thead>
              <tbody>
                {missing.map((m) => (
                  <tr key={m.column} className="odd:bg-white/2">
                    <td className="p-2">{m.column}</td>
                    <td className="p-2 text-right">{m.missing_count}</td>
                    <td className="p-2 text-right">{m.missing_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 元系列 + 移動平均 */}
      <div className="mt-8 bg-white/5 rounded p-4">
        <h3 className="text-lg font-semibold mb-2">元系列と移動平均</h3>
        <Line
          data={{
            labels: datesISO.map((d) => d.slice(0, 10)),
            datasets: [
              { label: "Actual", data: values, borderColor: "#2563eb", backgroundColor: "#2563eb", tension: 0.2 },
              { label: `MA(${maWindow})`, data: maData, borderColor: "#ef4444", backgroundColor: "#ef4444", tension: 0.2 },
            ],
          }}
          options={{ responsive: true, plugins: { legend: { position: "top" as const } }, interaction: { mode: "index" as const, intersect: false } }}
        />
      </div>

      {/* 曜日平均 */}
      <div className="mt-8 bg-white/5 rounded p-4">
        <h3 className="text-lg font-semibold mb-2">曜日別平均（合算）</h3>
        <Line
          data={{
            labels: weekday.labels,
            datasets: [
              { label: "平均", data: weekday.averages, borderColor: "#10b981", backgroundColor: "#10b981", tension: 0.2 },
            ],
          }}
          options={{ responsive: true, plugins: { legend: { position: "top" as const } } }}
        />
      </div>

      {/* 月別プロファイル */}
      {monthProfile && (
        <div className="mt-8 bg-white/5 rounded p-4">
          <h3 className="text-lg font-semibold mb-2">月別プロファイル</h3>
          <Line
            data={{
              labels: monthProfile.map((r) => `${r.month}月`),
              datasets: [
                { label: "数量(平均)", data: monthProfile.map((r) => r.qty), borderColor: "#1f77b4", backgroundColor: "#1f77b4", tension: 0.2 },
              ],
            }}
          />
        </div>
      )}

      {/* 自動周期推定の結果表示 */}
      {period && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-2">周期推定</h3>
          <div className="text-sm opacity-80">推定周期: {period.best}</div>
          <div className="overflow-auto border rounded mt-2">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-white/5">
                  <th className="text-left p-2">period</th>
                  <th className="text-right p-2">score</th>
                </tr>
              </thead>
              <tbody>
                {period.table.map((r) => (
                  <tr key={r.period} className="odd:bg-white/2">
                    <td className="p-2">{r.period}</td>
                    <td className="p-2 text-right">{Math.round(r.score * 1000) / 1000}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


