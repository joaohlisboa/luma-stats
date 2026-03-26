export function ScoreBadge({ score }: { score: number }) {
  const cls =
    score > 70
      ? "bg-green-50 text-green-700 border-green-200"
      : score >= 40
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";

  return (
    <span
      className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold border ${cls}`}
    >
      {score}
    </span>
  );
}
