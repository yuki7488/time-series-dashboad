Time Series Forecast Dashboard
==============================

美しくシンプルな時系列ダッシュボード。CSV をアップロードすると自動で予測を実行し（Holt-Winters/Holt）、推定値・予測値・EDA（移動平均、曜日別平均、月別プロファイル、簡易周期推定）を即座に可視化します。Vercel にそのままデプロイ可能です。

主な機能
- **CSVアップロード**: ヘッダー有無や列数の違いに柔軟対応。`date/value`や`ds/y`など一般的な別名を自動判別。
- **自動予測**: Holt-Winters（加法）/ Holt 線形をTypeScript実装。粗探索でパラメータ選択、API経由で実行。
- **EDA**: 欠損サマリ、移動平均、曜日別平均、月別プロファイル、簡易周期推定（自己相関ベース）。
- **チャート**: Chart.js + react-chartjs-2 による直感的な可視化。
- **Next.js**: App Router + TypeScript + Tailwind CSS v4。

デモ（ローカル）
- **前提**: Node.js 18+ 推奨
- **起動**
  - キー操作: ⌘ + Space → 「Terminal」→ Enter
  - コマンド:
    ```bash
    cd /Users/atoyuuki/python3/time-series-dashboad
    npm install
    npm run dev
    ```
  - ブラウザ: `http://localhost:3000`
- **操作**
  - 画面上部で「予測」「EDA」を切替
  - CSVを選択すると自動で解析/予測を実行
  - サンプルCSV: `public/sample.csv`

CSV 仕様（柔軟パース）
- **ヘッダーあり**を優先解釈。以下の列名を自動対応:
  - **日付候補**: `date`, `ds`, `timestamp`, `time`
  - **値候補**: `value`, `y`, `target`
- **ヘッダーなし/列数過多**の場合は、各列を走査して日付らしい列・数値らしい列を自動推定。
- 日付はISOや一般的フォーマットを許容。解析不能な行は自動スキップ。

API（予測）
- `POST /api/forecast`
  - Request
    ```json
    { "datesISO": ["2024-01-01T00:00:00.000Z", ...], "values": [100, ...], "horizon": 30 }
    ```
  - Response
    ```json
    { "method": "holt_winters_additive|holt_linear", "horizon": 30, "params": {"alpha":0.2, "beta":0.1, "gamma":0.1, "seasonLength":12}, "fitted": [...], "forecast": [...], "residuals": [...] }
    ```
- 実装: `src/lib/forecast.ts`（周期推定+粗探索、Holt/Holt-Winters 加法）

ディレクトリ構成（抜粋）
- `src/app/page.tsx`: トップ（予測/EDAのタブ）
- `src/components/UploadAndChart.tsx`: CSVアップロードと予測チャート
- `src/components/AdvancedEDA.tsx`: 欠損サマリ/移動平均/曜日/月別/周期推定
- `src/lib/csv.ts`: CSVパース（ヘッダー有無に対応）
- `src/lib/forecast.ts`: 予測ロジック（TS実装）
- `src/lib/eda.ts`: EDAユーティリティ

Vercel デプロイ
- GitHub連携済みなら、リポジトリをImportしてそのままデプロイ可能
- Build Command: `npm run build`
- Output Directory: `.next`
- 設定ファイル: `vercel.json`

開発コマンド
- 開発: `npm run dev`
- ビルド: `npm run build`
- 起動: `npm start`

貢献
- Issue/PR 歓迎。コードスタイルはデフォルトのESLint/TypeScript設定に準拠。

ライセンス
- MIT
