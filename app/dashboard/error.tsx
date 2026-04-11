"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center">
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
        <h2 className="text-lg font-semibold text-red-400">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {error.message || "An unexpected error occurred loading the dashboard."}
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
