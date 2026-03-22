"use client";

import { useState, useEffect, useCallback } from "react";

interface Photo {
  id: string;
  photo_url?: string;
  photo_path?: string;
  caption?: string | null;
  category?: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  hin_plate: "HIN Plate",
  engine_hours: "Engine Hours",
  before: "Before",
  after: "After",
  damage: "Damage",
  general: "General",
};

function getCategoryLabel(category: string | null | undefined): string {
  if (!category) return "Photo";
  return CATEGORY_LABELS[category] || category;
}

function getCategoryColor(category: string | null | undefined): string {
  switch (category) {
    case "hin_plate":
      return "bg-blue-500/20 text-blue-400";
    case "engine_hours":
      return "bg-amber-500/20 text-amber-400";
    case "before":
      return "bg-emerald-500/20 text-emerald-400";
    case "after":
      return "bg-purple-500/20 text-purple-400";
    case "damage":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-slate-500/20 text-slate-400";
  }
}

export function PhotoGallery({
  photos,
  storageBucket,
}: {
  photos: Photo[];
  storageBucket: string;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  function getPhotoUrl(photo: Photo): string {
    if (photo.photo_url) return photo.photo_url;
    if (photo.photo_path) {
      return `https://jwedhavnxqwkczefjifs.supabase.co/storage/v1/object/public/${storageBucket}/${photo.photo_path}`;
    }
    return "";
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "Escape") {
        setLightboxIndex(null);
      } else if (e.key === "ArrowLeft") {
        setLightboxIndex((prev) =>
          prev !== null && prev > 0 ? prev - 1 : photos.length - 1
        );
      } else if (e.key === "ArrowRight") {
        setLightboxIndex((prev) =>
          prev !== null && prev < photos.length - 1 ? prev + 1 : 0
        );
      }
    },
    [lightboxIndex, photos.length]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll when lightbox is open
  useEffect(() => {
    if (lightboxIndex !== null) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [lightboxIndex]);

  if (!photos || photos.length === 0) return null;

  const currentPhoto = lightboxIndex !== null ? photos[lightboxIndex] : null;

  return (
    <>
      <div className="rounded-xl border border-border-line bg-card-bg p-6 print:border-gray-300">
        <h2 className="mb-4 text-lg font-semibold text-text-primary">
          Photos ({photos.length})
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              onClick={() => setLightboxIndex(index)}
              className="group relative overflow-hidden rounded-lg border border-border-line focus:outline-none focus:ring-2 focus:ring-gold/50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getPhotoUrl(photo)}
                alt={photo.caption || getCategoryLabel(photo.category)}
                className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
              {photo.category && (
                <div className="absolute top-2 left-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${getCategoryColor(photo.category)}`}
                  >
                    {getCategoryLabel(photo.category)}
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
              {photo.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4">
                  <p className="truncate text-xs text-white">{photo.caption}</p>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxIndex !== null && currentPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 no-print"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Close button */}
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Previous button */}
          {photos.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((prev) =>
                  prev !== null && prev > 0 ? prev - 1 : photos.length - 1
                );
              }}
              className="absolute left-4 z-10 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          )}

          {/* Image */}
          <div
            className="relative max-h-[85vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getPhotoUrl(currentPhoto)}
              alt={
                currentPhoto.caption ||
                getCategoryLabel(currentPhoto.category)
              }
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
            />
            {/* Photo info bar */}
            <div className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {currentPhoto.category && (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getCategoryColor(currentPhoto.category)}`}
                    >
                      {getCategoryLabel(currentPhoto.category)}
                    </span>
                  )}
                  {currentPhoto.caption && (
                    <span className="text-sm text-white/80">
                      {currentPhoto.caption}
                    </span>
                  )}
                </div>
                <span className="text-sm text-white/50">
                  {lightboxIndex + 1} / {photos.length}
                </span>
              </div>
            </div>
          </div>

          {/* Next button */}
          {photos.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((prev) =>
                  prev !== null && prev < photos.length - 1 ? prev + 1 : 0
                );
              }}
              className="absolute right-4 z-10 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          )}
        </div>
      )}
    </>
  );
}
