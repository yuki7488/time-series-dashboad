import UploadAndChart from "@/components/UploadAndChart";

export default function Home() {
  return (
    <div className="min-h-screen p-8 sm:p-12">
      <main className="max-w-5xl mx-auto flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Time Series Forecast Dashboard</h1>
        <p className="opacity-80 text-sm">CSVをアップロードすると自動的に時系列予測を実行し、推定値と予測値を可視化します。</p>
        <UploadAndChart />
      </main>
    </div>
  );
}
