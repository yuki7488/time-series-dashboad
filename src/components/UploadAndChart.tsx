"use client";

import { useMemo, useRef, useState } from "react";
import { parseCsv, toSeries, type CsvRow } from "@/lib/csv";
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

  const { datesISO, values } = useMemo(() => toSeries(rows), [rows]);

  const labels = useMemo(() => {
    const base = datesISO.map((d) => new Date(d).toISOString().slice(0, 10));
    if (forecast && forecast.length > 0) {
      const last = datesISO[datesISO.length - 1];
      if (last) {
        const lastDate = new Date(last);
        const future: string[] = [];
        for (let i = 1; i <= forecast.length; i += 1) {
          const dt = new Date(lastDate);
          dt.setDate(dt.getDate() + i);
          future.push(dt.toISOString().slice(0, 10));
        }
        return [...base, ...future];
      }
    }
    return base;
  }, [datesISO, forecast]);

  const data = useMemo(() => {
    const actualData = values;
    const fittedData = fitted ?? [];
    const forecastData = forecast ?? [];
    const paddedFitted = new Array(Math.max(0, actualData.length - fittedData.length)).fill(null);
    const paddedForecast = new Array(actualData.length).fill(null).concat(forecastData);
    return {
      labels,
      datasets: [
        {
          label: "Actual",
          data: actualData,
          borderColor: "#2563eb",
          backgroundColor: "#2563eb",
          tension: 0.2,
        },
        {
          label: "Fitted",
          data: paddedFitted.concat(fittedData),
          borderColor: "#10b981",
          backgroundColor: "#10b981",
          borderDash: [6, 6],
          tension: 0.2,
        },
        {
          label: "Forecast",
          data: paddedForecast,
          borderColor: "#f59e0b",
          backgroundColor: "#f59e0b",
          borderDash: [2, 4],
          tension: 0.2,
        },
      ],
    };
  }, [labels, values, fitted, forecast]);

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
        // Quick sniff: if headerless, add header
        const needsHeader = !/date|ds|timestamp|time/i.test(content.split(/\r?\n/)[0] ?? "");
        const withHeader = needsHeader ? `date,value\n${content}` : content;
        const parsed = parseCsv(withHeader);
        if (parsed.length === 0) {
          setError("CSVに有効な行がありません。(必要列: date,value)");
          return;
        }
        setRows(parsed);
        setError(null);
        setForecast(null);
        setFitted(null);
        setMethod(null);

        // Auto-forecast immediately after upload
        const s = toSeries(parsed);
        void forecastWith(s.datesISO, s.values, horizon);
      } catch (err) {
        setError(err instanceof Error ? err.message : "CSV parse error");
      }
    };
    reader.readAsText(file);
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

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="block text-sm mb-1">CSVアップロード (date,value)</label>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-4 py-2 rounded bg-foreground text-background"
              onClick={onClickUpload}
            >
              ファイルを選択
            </button>
            <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
            <input
              type="number"
              className="border px-3 py-2 rounded w-28 bg-transparent"
              min={1}
              max={365}
              value={horizon}
              onChange={(e) => setHorizon(parseInt(e.target.value || "30", 10))}
            />
            <button
              type="button"
              className="px-4 py-2 rounded border"
              onClick={onClickForecast}
            >
              予測実行
            </button>
          </div>
        </div>
        {method && <div className="text-sm opacity-80">Method: {method}</div>}
      </div>

      {error && (
        <div className="mt-4 text-red-500 text-sm">
          {error}
        </div>
      )}

      <div className="mt-8 bg-white/5 rounded p-4">
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


