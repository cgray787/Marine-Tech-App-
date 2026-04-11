export default function JobsLoading() {
  return (
    <div>
      <div className="mb-8">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-card-bg" />
        <div className="mt-2 h-4 w-60 animate-pulse rounded bg-card-bg" />
      </div>
      <div className="mb-6 rounded-xl border border-border-line bg-card-bg p-6">
        <div className="h-5 w-36 animate-pulse rounded bg-secondary-bg" />
        <div className="mt-4 flex gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-10 w-full animate-pulse rounded-lg bg-secondary-bg"
            />
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border-line bg-card-bg">
        <div className="divide-y divide-border-line">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-8 px-6 py-4">
              <div className="h-4 w-24 animate-pulse rounded bg-secondary-bg" />
              <div className="h-4 w-28 animate-pulse rounded bg-secondary-bg" />
              <div className="h-4 w-32 animate-pulse rounded bg-secondary-bg" />
              <div className="h-4 w-20 animate-pulse rounded bg-secondary-bg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
