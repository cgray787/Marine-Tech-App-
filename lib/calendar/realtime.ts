import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

export function subscribeToJobs(
  supabase: SupabaseClient,
  onChange: () => void,
): RealtimeChannel {
  const channelName = `calendar-jobs-${Math.random().toString(36).slice(2, 10)}`;
  const channel = supabase
    .channel(channelName)
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
