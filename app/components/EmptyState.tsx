export function EmptyState() {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="max-w-md mx-auto text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-stone-200 flex items-center justify-center mx-auto mb-6">
          <span className="text-2xl text-stone-400">~</span>
        </div>
        <h1 className="text-2xl font-bold text-stone-800 mb-2">
          No data yet
        </h1>
        <p className="text-stone-500 mb-8">
          Export your guest list from Luma and process it to see your dashboard.
        </p>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100 text-left space-y-4">
          <Step n={1} text="Export your guest list CSV from Luma" />
          <Step n={2} text="Place it at data/list.csv" />
          <Step n={3} text="Run pnpm process" />
          <Step n={4} text="Run pnpm dev to see your dashboard" />
        </div>
      </div>
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-stone-800 text-white text-xs font-bold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <p className="text-sm text-stone-600">{text}</p>
    </div>
  );
}
