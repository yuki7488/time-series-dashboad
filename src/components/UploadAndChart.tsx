"use client";

import { useMemo, useRef, useState } from "react";
import { parseCsv, toSeries, type CsvRow } from "@/lib/csv";
import { Line } from "react-chartjs-2";
import { aggregateSeries, type Frequency } from "@/lib/eda";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function UploadAndChart() {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<number>(30);
  const [forecast, setForecast] = useState<number[] | null>(null);
  const [fitted, setFitted] = useState<number[] | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);

  const { datesISO, values } = useMemo(() => toSeries(rows), [rows]);

  const [freq, setFreq] = useState<Frequency>("D");

  const baseLabels = useMemo(() => {
    const agg = aggregateSeries(datesISO, values, freq);
    return agg.labels;
  }, [datesISO, values, freq]);

  const labels = useMemo(() => {
    const base = baseLabels;
    if (forecast && forecast.length > 0) {
      const last = datesISO[datesISO.length - 1];
      if (last) {
        if (freq === "D") {
          const lastDate = new Date(last);
          const future: string[] = [];
          for (let i = 1; i <= forecast.length; i += 1) {
            const dt = new Date(lastDate);
            dt.setDate(dt.getDate() + i);
            future.push(dt.toISOString().slice(0, 10));
          }
          return [...base, ...future];
        }
        // For M/Y, just append placeholders
        return [...base, ...Array.from({ length: forecast.length }, (_, i) => `+${i + 1}`)];
      }
    }
    return base;
  }, [baseLabels, datesISO, forecast, freq]);

  const data = useMemo(() => {
    // Aggregate actuals to selected freq
    const agg = aggregateSeries(datesISO, values, freq);
    const actualData = agg.values;
    const fittedData = fitted ?? [];
    const forecastData = forecast ?? [];
    const paddedFitted = new Array(Math.max(0, actualData.length - fittedData.length)).fill(null);
    const paddedForecast = new Array(actualData.length).fill(null).concat(forecastData);
    return {
      labels,
      datasets: [
        { label: "Actual", data: actualData, borderColor: "#60a5fa", backgroundColor: "#60a5fa", tension: 0.25 },
        { label: "Fitted", data: paddedFitted.concat(fittedData), borderColor: "#34d399", backgroundColor: "#34d399", borderDash: [6, 6], tension: 0.25 },
        { label: "Forecast", data: paddedForecast, borderColor: "#fbbf24", backgroundColor: "#fbbf24", borderDash: [2, 4], tension: 0.25 },
      ],
    };
  }, [labels, datesISO, values, fitted, forecast, freq]);

  function onClickUpload() {
    inputRef.current?.click();
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content = String(reader.result ?? "");
        const parsed = parseCsv(content);
        if (parsed.length === 0) {
          setError("CSVに有効な行がありません。(date/value 列が解釈できません)");
          return;
        }
        setRows(parsed);
        setError(null);
        setForecast(null);
        setFitted(null);
        setMethod(null);
        const s = toSeries(parsed);
        void forecastWith(s.datesISO, s.values, horizon);
      } catch (err) {
        setError(err instanceof Error ? err.message : "CSV parse error");
      }
    };
    reader.readAsText(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dropRef.current?.classList.add("ring-2", "ring-emerald-400");
  }
  function onDragLeave() {
    dropRef.current?.classList.remove("ring-2", "ring-emerald-400");
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dropRef.current?.classList.remove("ring-2", "ring-emerald-400");
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function forecastWith(dates: string[], series: number[], h: number) {
    try {
      const res = await fetch("/api/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datesISO: dates, values: series, horizon: h }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "API error");
      setForecast(json.forecast);
      setFitted(json.fitted);
      setMethod(json.method);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "予測に失敗しました");
    }
  }

  async function onClickForecast() {
    if (values.length === 0) {
      setError("データを先にアップロードしてください。");
      return;
    }
    await forecastWith(datesISO, values, horizon);
  }

  // Summary metrics
  const mae = useMemo(() => {
    if (!fitted) return null;
    const n = Math.min(values.length, fitted.length);
    if (n === 0) return null;
    let s = 0;
    for (let i = 0; i < n; i += 1) s += Math.abs(values[i] - fitted[i]!);
    return s / n;
  }, [values, fitted]);
  const mape = useMemo(() => {
    if (!fitted) return null;
    const n = Math.min(values.length, fitted.length);
    if (n === 0) return null;
    let s = 0;
    let cnt = 0;
    for (let i = 0; i < n; i += 1) {
      if (values[i] !== 0) {
        s += Math.abs((values[i] - (fitted[i] ?? 0)) / values[i]);
        cnt += 1;
      }
    }
    return cnt === 0 ? null : (s / cnt) * 100;
  }, [values, fitted]);

  function exportCsv() {
    const rowsOut: string[] = ["date,actual,fitted,forecast"];
    const baseLen = datesISO.length;
    for (let i = 0; i < labels.length; i += 1) {
      const date = labels[i];
      const actual = i < baseLen ? values[i] ?? "" : "";
      const fit = i < baseLen ? (fitted?.[i] ?? "") : "";
      const fc = i >= baseLen ? (forecast?.[i - baseLen] ?? "") : "";
      rowsOut.push([date, actual, fit, fc].join(","));
    }
    const blob = new Blob([rowsOut.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "forecast_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
        <div className="sm:col-span-2">
          <label className="block text-xs uppercase tracking-wider opacity-70 mb-2">Upload CSV</label>
          <div
            ref={dropRef}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className="group border border-white/10 rounded-lg p-4 bg-white/5 hover:bg-white/10 transition-colors"
          >
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="px-4 py-2 rounded bg-emerald-500 text-white shadow hover:bg-emerald-400" onClick={onClickUpload}>
                ファイルを選択
              </button>
              <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
              <div className="flex items-center gap-2">
                <span className="text-sm opacity-80">ホライズン</span>
                <input
                  type="number"
                  className="border border-white/10 bg-transparent px-3 py-2 rounded w-28"
                  min={1}
                  max={365}
                  value={horizon}
                  onChange={(e) => setHorizon(parseInt(e.target.value || "30", 10))}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm opacity-80">集計</span>
                <select className="border border-white/10 bg-transparent px-3 py-2 rounded" value={freq} onChange={(e) => setFreq(e.target.value as Frequency)}>
                  <option value="D">日</option>
                  <option value="M">月</option>
                  <option value="Y">年</option>
                </select>
              </div>
              <button type="button" className="px-4 py-2 rounded border border-white/20 hover:bg-white/5" onClick={onClickForecast}>
                予測実行
              </button>
              <a href="/sample.csv" download className="ml-auto text-xs underline opacity-80 hover:opacity-100">サンプルCSV</a>
              <button type="button" className="text-xs px-3 py-2 rounded border border-white/20 hover:bg-white/5" onClick={exportCsv}>
                エクスポート
              </button>
            </div>
            {method && <div className="text-xs opacity-70 mt-2">Method: {method}</div>}
            <div className="mt-3 text-xs opacity-60">ここにファイルをドラッグ&ドロップできます</div>
          </div>
        </div>
        <div className="sm:col-span-1">
          <label className="block text-xs uppercase tracking-wider opacity-70 mb-2">概要</label>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-white/5 p-3 border border-white/10">
              <div className="text-[10px] opacity-70">点数</div>
              <div className="text-lg font-semibold">{values.length}</div>
            </div>
            <div className="rounded-lg bg-white/5 p-3 border border-white/10">
              <div className="text-[10px] opacity-70">最小</div>
              <div className="text-lg font-semibold">{values.length ? Math.min(...values).toFixed(1) : "-"}</div>
            </div>
            <div className="rounded-lg bg-white/5 p-3 border border-white/10">
              <div className="text-[10px] opacity-70">最大</div>
              <div className="text-lg font-semibold">{values.length ? Math.max(...values).toFixed(1) : "-"}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="rounded-lg bg-white/5 p-3 border border-white/10">
              <div className="text-[10px] opacity-70">MAE</div>
              <div className="text-lg font-semibold">{mae != null ? mae.toFixed(2) : "-"}</div>
            </div>
            <div className="rounded-lg bg-white/5 p-3 border border-white/10">
              <div className="text-[10px] opacity-70">MAPE</div>
              <div className="text-lg font-semibold">{mape != null ? `${mape.toFixed(1)}%` : "-"}</div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="mt-8 bg-white/5 rounded-xl p-4 border border-white/10 shadow-inner">
        <Line
          data={data}
          options={{
            responsive: true,
            plugins: {
              legend: { position: "top" as const },
              title: { display: true, text: "Time Series Forecast" },
            },
            interaction: { mode: "index" as const, intersect: false },
            scales: {
              x: { ticks: { maxRotation: 0, autoSkip: true } },
              y: { beginAtZero: false },
            },
          }}
        />
      </div>
    </div>
  );
}


