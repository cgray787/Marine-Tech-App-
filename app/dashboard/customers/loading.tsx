export default function CustomersLoading() {
  return (
    <div>
      <div className="mb-8">
        <div className="h-8 w-52 animate-pulse rounded-lg bg-card-bg" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-card-bg" />
      </div>
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border-line bg-card-bg p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="h-5 w-40 animate-pulse rounded bg-secondary-bg" />
                <div className="mt-2 h-3 w-56 animate-pulse rounded bg-secondary-bg" />
              </div>
              <div className="h-8 w-20 animate-pulse rounded bg-secondary-bg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
