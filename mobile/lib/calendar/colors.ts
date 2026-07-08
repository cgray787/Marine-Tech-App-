import type { JobStatus } from './types';

export const TECH_PALETTE = [
  '#3b6cd6',
  '#a855f7',
  '#ec4899',
  '#f97316',
  '#14b8a6',
  '#84cc16',
  '#f59e0b',
  '#06b6d4',
] as const;

export function techColor(techId: string): string {
  let h = 0;
  for (let i = 0; i < techId.length; i++) {
    h = (h * 31 + techId.charCodeAt(i)) >>> 0;
  }
  return TECH_PALETTE[h % TECH_PALETTE.length];
}

// Calendar job bars/dots are colored by CLIENT (not tech) so different
// customers are visually distinct instead of every item being one color.
// Five distinct, white-text-legible hues on the dark theme; the client id is
// hashed so each client gets a stable color across days and views.
export const CLIENT_PALETTE = [
  '#3b6cd6', // blue
  '#14b8a6', // teal
  '#a855f7', // purple
  '#f97316', // orange
  '#ec4899', // pink
] as const;

// Neutral slate for service jobs with no linked client.
const CLIENTLESS_FALLBACK = '#64748b';

export function clientColor(clientId: string | null | undefined): string {
  if (!clientId) return CLIENTLESS_FALLBACK;
  let h = 0;
  for (let i = 0; i < clientId.length; i++) {
    h = (h * 31 + clientId.charCodeAt(i)) >>> 0;
  }
  return CLIENT_PALETTE[h % CLIENT_PALETTE.length];
}

// Each job gets its own left-stripe color (hashed from its id) so individual
// jobs are visually distinct on the calendar — even several jobs for the same
// client (which share a fill color).
export const JOB_STRIPE_PALETTE = [
  '#f43f5e', // rose
  '#4ade80', // green
  '#facc15', // amber
  '#38bdf8', // sky
  '#c084fc', // violet
  '#fb923c', // orange
  '#2dd4bf', // turquoise
  '#f472b6', // pink
] as const;

export function jobStripeColor(jobId: string): string {
  let h = 0;
  for (let i = 0; i < jobId.length; i++) {
    h = (h * 31 + jobId.charCodeAt(i)) >>> 0;
  }
  return JOB_STRIPE_PALETTE[h % JOB_STRIPE_PALETTE.length];
}

const STATUS_STRIPE: Record<JobStatus, string> = {
  new: '#4ade80',
  in_progress: '#f59e0b',
  completed: '#94a3b8',
};

export function statusStripeColor(status: JobStatus): string {
  return STATUS_STRIPE[status];
}
