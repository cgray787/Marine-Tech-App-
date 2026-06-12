import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(date: string | Date | null) {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Format a DATE-ONLY string (YYYY-MM-DD) without the UTC-midnight timezone shift. */
export function formatDateOnly(date: string | null) {
  if (!date) return "N/A";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return formatDate(date);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function formatDateTime(date: string | Date | null) {
  if (!date) return "N/A";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function statusColor(status: string) {
  switch (status) {
    case "new":
    case "submitted":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "in_progress":
    case "reviewed":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "completed":
    case "approved":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "correction_needed":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "draft":
      return "bg-slate-500/15 text-slate-300 border-slate-500/30";
    case "invoiced":
      return "bg-gold-muted text-gold border-gold/30";
    default:
      return "bg-slate-500/15 text-slate-400 border-slate-500/30";
  }
}
