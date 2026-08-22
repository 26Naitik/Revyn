export default function DashboardLoading() {
  return (
    <div className="animate-pulse p-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-lg border border-gray-200 bg-white" />
        ))}
      </div>
      <div className="mt-8 h-24 rounded-lg border border-gray-200 bg-white" />
      <div className="mt-8 h-10 w-56 rounded bg-gray-200" />
      <div className="mt-3 space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 rounded-md border border-gray-100 bg-gray-50" />
        ))}
      </div>
    </div>
  );
}
