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

const STATUS_STRIPE: Record<JobStatus, string> = {
  new: '#4ade80',
  in_progress: '#f59e0b',
  completed: '#94a3b8',
};

export function statusStripeColor(status: JobStatus): string {
  return STATUS_STRIPE[status];
}
