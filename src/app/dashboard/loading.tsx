export default function DashboardLoading() {
  return (
    <div className="px-4 pb-10 pt-6 sm:px-6 lg:px-8" aria-busy="true">
      <div className="h-9 w-64 animate-pulse rounded-lg bg-line/60" />
      <div className="mt-2 h-4 w-80 animate-pulse rounded bg-line/40" />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[118px] animate-pulse rounded-xl border border-line bg-surface"
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="h-[360px] animate-pulse rounded-xl border border-line bg-surface xl:col-span-2" />
        <div className="h-[360px] animate-pulse rounded-xl border border-line bg-surface" />
      </div>

      <div className="mt-6 h-[180px] animate-pulse rounded-xl border border-line bg-surface" />
    </div>
  );
}
