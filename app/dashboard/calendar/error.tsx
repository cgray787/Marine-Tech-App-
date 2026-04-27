'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-6 text-white">
      <h2 className="text-2xl mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
        Couldn't load calendar
      </h2>
      <p className="text-[#8892A5] mb-4">{error.message}</p>
      <button onClick={reset} className="bg-[#C9A96E] text-[#060a12] px-4 py-2 rounded font-semibold">
        Retry
      </button>
    </div>
  );
}
