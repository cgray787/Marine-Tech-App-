import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

export function subscribeToJobs(
  supabase: SupabaseClient,
  onChange: () => void,
): RealtimeChannel {
  const channel = supabase
    .channel('calendar-jobs')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'jobs' },
      () => onChange(),
    )
    .subscribe();
  return channel;
}

export function unsubscribe(supabase: SupabaseClient, channel: RealtimeChannel) {
  supabase.removeChannel(channel);
}
