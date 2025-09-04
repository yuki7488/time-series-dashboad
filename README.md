Time Series Forecast Dashboard
================================

概要
----
CSV をアップロードすると自動で時系列予測（Holt-Winters/Holt）を行い、チャートで可視化するシンプルなダッシュボードです。Vercel にそのままデプロイ可能です。

使い方
----
1. ローカルで起動
   - キー操作: ⌘ + Space → 「Terminal」→ Enter
   - コマンド: `cd /Users/atoyuuki/python3/time-series-dashboad && npm run dev`
   - ブラウザで `http://localhost:3000` を開く
2. 画面上部から CSV をアップロード（`date,value` 列）。サンプルは `/public/sample.csv` 参照。
3. 予測ホライズン（日数）を指定し「予測実行」を押下すると、推定値/予測値がチャート表示されます。

CSV 仕様
----
- 必須列: `date`, `value`
- 列名は `ds/y` や `timestamp/target` などの一般的な別名も自動認識します
- 日付は ISO または一般的な日付フォーマットを許容

技術構成
----
- Next.js(App Router, TypeScript)
- Tailwind CSS v4
- Chart.js + react-chartjs-2
- 予測: Holt-Winters additive / Holt linear を TypeScript 実装（`src/lib/forecast.ts`）

API
----
- `POST /api/forecast`
  - Request: `{ datesISO: string[], values: number[], horizon: number }`
  - Response: `{ method, horizon, params, fitted: number[], forecast: number[], residuals: number[] }`

Vercel デプロイ
----
1. このフォルダをプロジェクトルートとして Vercel に import
2. Build Command: `npm run build`
3. Output: `.next`
4. そのままデプロイ可

ライセンス
----
MIT
