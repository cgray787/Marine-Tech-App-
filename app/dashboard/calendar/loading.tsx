export default function Loading() {
  return (
    <div className="p-6">
      <div className="h-8 w-48 bg-[#1a2236] rounded animate-pulse mb-4" />
      <div className="h-12 w-full bg-[#1a2236] rounded animate-pulse mb-4" />
      <div className="grid grid-cols-7 gap-px bg-[#1a2236] rounded-lg overflow-hidden">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-32 bg-[#0d1320]" />
        ))}
      </div>
    </div>
  );
}
