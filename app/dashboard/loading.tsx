export default function DashboardLoading() {
  return (
    <div>
      <div className="mb-8">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-card-bg" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-card-bg" />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border-line bg-card-bg p-6"
          >
            <div className="h-4 w-24 animate-pulse rounded bg-secondary-bg" />
            <div className="mt-3 h-9 w-16 animate-pulse rounded bg-secondary-bg" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border-line bg-card-bg"
          >
            <div className="border-b border-border-line px-6 py-4">
              <div className="h-5 w-36 animate-pulse rounded bg-secondary-bg" />
            </div>
            <div className="divide-y divide-border-line">
              {[1, 2, 3].map((j) => (
                <div key={j} className="px-6 py-4">
                  <div className="h-4 w-48 animate-pulse rounded bg-secondary-bg" />
                  <div className="mt-2 h-3 w-32 animate-pulse rounded bg-secondary-bg" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
