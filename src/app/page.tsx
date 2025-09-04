import UploadAndChart from "@/components/UploadAndChart";
import AdvancedEDA from "@/components/AdvancedEDA";

export default function Home() {
  return (
    <div className="min-h-screen p-8 sm:p-12">
      <main className="max-w-6xl mx-auto flex flex-col gap-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Time Series Forecast & EDA</h1>
          <p className="opacity-80 text-sm">CSVをアップロードすると自動予測とEDAを実行し、結果を可視化します。</p>
        </div>

        <div className="flex gap-2 text-xs">
          <a href="#tab-forecast" className="px-3 py-2 rounded border border-white/10 bg-white/5 hover:bg-white/10">予測</a>
          <a href="#tab-eda" className="px-3 py-2 rounded border border-white/10 bg-white/5 hover:bg-white/10">EDA</a>
        </div>

        <section id="tab-forecast">
          <UploadAndChart />
        </section>
        <section id="tab-eda" className="pt-8">
          <AdvancedEDA />
        </section>
      </main>
    </div>
  );
}
