export default function TechniciansLoading() {
  return (
    <div>
      <div className="mb-8">
        <div className="h-8 w-44 animate-pulse rounded-lg bg-card-bg" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-card-bg" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border-line bg-card-bg p-6"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 animate-pulse rounded-full bg-secondary-bg" />
              <div>
                <div className="h-5 w-32 animate-pulse rounded bg-secondary-bg" />
                <div className="mt-2 h-3 w-40 animate-pulse rounded bg-secondary-bg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
