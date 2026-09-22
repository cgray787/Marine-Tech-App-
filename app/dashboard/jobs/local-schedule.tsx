'use client';
import { useSyncExternalStore } from 'react';
import { formatDate } from '@/lib/utils';
import { formatTime } from '@/lib/calendar/format';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Browser-local schedule after hydration; Workers render in UTC. */
export function LocalSchedule({ value, stacked = false }: { value: string; stacked?: boolean }) {
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  if (!hydrated) return <time dateTime={value}>Scheduled</time>;
  return stacked ? (
    <time dateTime={value}>
      <span className="block text-text-primary tabular-nums">{formatDate(value)}</span>
      <span className="block text-xs text-gold tabular-nums">{formatTime(value)}</span>
    </time>
  ) : <time dateTime={value}>{formatDate(value)} {formatTime(value)}</time>;
}
