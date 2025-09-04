// Forecasting utilities: frequency detection and Holt-Winters/Holt methods
// The implementation focuses on clarity and reliability for small-to-medium datasets.

export type TimeFrequency =
  | { kind: "daily"; period: 7 }
  | { kind: "monthly"; period: 12 }
  | { kind: "weekly"; period: 52 }
  | { kind: "unknown"; period: 0 };

export interface AutoForecastResult {
  method: "holt_winters_additive" | "holt_linear";
  horizon: number;
  params: { alpha: number; beta: number; gamma?: number; seasonLength?: number };
  fitted: number[];
  forecast: number[];
  residuals: number[];
}

export function detectFrequency(isoDates: string[]): TimeFrequency {
  if (isoDates.length < 3) return { kind: "unknown", period: 0 };
  const timestamps = isoDates.map((d) => new Date(d).getTime()).sort((a, b) => a - b);
  const deltas: number[] = [];
  for (let i = 1; i < timestamps.length; i += 1) {
    const deltaDays = (timestamps[i] - timestamps[i - 1]) / (1000 * 60 * 60 * 24);
    if (Number.isFinite(deltaDays)) deltas.push(deltaDays);
  }
  if (deltas.length === 0) return { kind: "unknown", period: 0 };
  const median = medianNumber(deltas);
  if (median > 25 && median < 32) return { kind: "monthly", period: 12 };
  if (median > 6 && median < 8) return { kind: "weekly", period: 52 };
  if (median > 0.9 && median < 1.2) return { kind: "daily", period: 7 };
  return { kind: "unknown", period: 0 };
}

function medianNumber(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

export function holtLinear(
  series: number[],
  horizon: number,
  alpha: number,
  beta: number
): { fitted: number[]; forecast: number[]; residuals: number[] } {
  if (series.length < 2) {
    const last = series[series.length - 1] ?? 0;
    return { fitted: [...series], forecast: Array(horizon).fill(last), residuals: Array(series.length).fill(0) };
  }
  const fitted: number[] = [];
  const residuals: number[] = [];
  let level = series[0];
  let trend = series[1] - series[0];
  for (let t = 0; t < series.length; t += 1) {
    const value = series[t];
    const prevLevel = level;
    level = alpha * value + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    const fittedValue = level + trend;
    fitted.push(fittedValue);
    residuals.push(value - fittedValue);
  }
  const lastLevel = level;
  const lastTrend = trend;
  const forecast = Array.from({ length: horizon }, (_, i) => lastLevel + (i + 1) * lastTrend);
  return { fitted, forecast, residuals };
}

export function holtWintersAdditive(
  series: number[],
  horizon: number,
  seasonLength: number,
  alpha: number,
  beta: number,
  gamma: number
): { fitted: number[]; forecast: number[]; residuals: number[] } {
  const n = series.length;
  if (n < seasonLength + 2) {
    // Not enough data for seasonal model, fallback to Holt's linear
    return holtLinear(series, horizon, alpha, beta);
  }

  // Initialize seasonal indices using first season
  const seasonals: number[] = Array(seasonLength).fill(0);
  const seasonAverages: number[] = [];
  const numSeasons = Math.floor(n / seasonLength);
  for (let s = 0; s < numSeasons; s += 1) {
    const start = s * seasonLength;
    const end = start + seasonLength;
    const avg = mean(series.slice(start, Math.min(end, n)));
    seasonAverages.push(avg);
  }
  for (let i = 0; i < seasonLength; i += 1) {
    let sum = 0;
    let count = 0;
    for (let s = 0; s < numSeasons; s += 1) {
      const idx = s * seasonLength + i;
      if (idx < n) {
        sum += series[idx] - seasonAverages[s];
        count += 1;
      }
    }
    seasonals[i] = count > 0 ? sum / count : 0;
  }

  let level = series[0] - seasonals[0];
  let trend = (series[seasonLength] - series[0]) / seasonLength;
  const fitted: number[] = [];
  const residuals: number[] = [];

  for (let t = 0; t < n; t += 1) {
    const seasonIndex = t % seasonLength;
    const value = series[t];
    const prevLevel = level;
    const prevSeason = seasonals[seasonIndex];
    level = alpha * (value - prevSeason) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    seasonals[seasonIndex] = gamma * (value - level) + (1 - gamma) * prevSeason;
    const fittedValue = level + trend + seasonals[seasonIndex];
    fitted.push(fittedValue);
    residuals.push(value - fittedValue);
  }

  const lastLevel = level;
  const lastTrend = trend;
  const forecast: number[] = [];
  for (let i = 1; i <= horizon; i += 1) {
    const seasonIndex = (n + i - 1) % seasonLength;
    forecast.push(lastLevel + i * lastTrend + seasonals[seasonIndex]);
  }
  return { fitted, forecast, residuals };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sse(values: number[], fitted: number[]): number {
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const e = values[i] - fitted[i];
    sum += e * e;
  }
  return sum;
}

export function autoForecast(
  series: number[],
  datesISO: string[],
  horizon: number
): AutoForecastResult {
  const freq = detectFrequency(datesISO);

  // Coarse grid search for smoothing params to minimize SSE on in-sample fit
  const alphaGrid = [0.1, 0.2, 0.3, 0.5, 0.8];
  const betaGrid = [0.05, 0.1, 0.2, 0.3];
  const gammaGrid = [0.05, 0.1, 0.2];

  let best: (AutoForecastResult & { sse?: number }) | null = null;

  const tryUpdateBest = (candidate: AutoForecastResult): void => {
    const currentSse = sse(series, candidate.fitted);
    if (!best) {
      best = { ...candidate, sse: currentSse };
      return;
    }
    if ((best.sse ?? Number.POSITIVE_INFINITY) > currentSse) {
      best = { ...candidate, sse: currentSse };
    }
  };

  if (freq.kind === "daily" || freq.kind === "weekly" || freq.kind === "monthly") {
    const seasonLength = freq.period;
    for (const alpha of alphaGrid) {
      for (const beta of betaGrid) {
        for (const gamma of gammaGrid) {
          const { fitted, forecast, residuals } = holtWintersAdditive(
            series,
            horizon,
            seasonLength,
            alpha,
            beta,
            gamma
          );
          tryUpdateBest({
            method: "holt_winters_additive",
            horizon,
            params: { alpha, beta, gamma, seasonLength },
            fitted,
            forecast,
            residuals,
          });
        }
      }
    }
  }

  // Also evaluate Holt's linear as fallback or competitor
  for (const alpha of alphaGrid) {
    for (const beta of betaGrid) {
      const { fitted, forecast, residuals } = holtLinear(series, horizon, alpha, beta);
      tryUpdateBest({
        method: "holt_linear",
        horizon,
        params: { alpha, beta },
        fitted,
        forecast,
        residuals,
      });
    }
  }

  // This should never be null because Holt's loop will set it, but add a guard
  if (!best) {
    const hl = holtLinear(series, horizon, 0.2, 0.1);
    return {
      method: "holt_linear",
      horizon,
      params: { alpha: 0.2, beta: 0.1 },
      ...hl,
    };
  }
  // Return without internal metric
  const chosen = best as AutoForecastResult & { sse?: number };
  return {
    method: chosen.method,
    horizon: chosen.horizon,
    params: chosen.params,
    fitted: chosen.fitted,
    forecast: chosen.forecast,
    residuals: chosen.residuals,
  };
}


