import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import type { CalendarJob } from '@/lib/calendar/types';
import { clientColor, jobStripeColor } from '@/lib/calendar/colors';
import { formatTime } from '@/lib/calendar/format';

type Props = {
  jobs: CalendarJob[];
  onSelect: (job: CalendarJob) => void;
};

export function DayList({ jobs, onSelect }: Props) {
  if (jobs.length === 0) {
    return <View style={styles.empty}><Text style={styles.emptyText}>No jobs on this day</Text></View>;
  }
  return (
    <FlatList
      data={jobs}
      keyExtractor={(j) => j.id}
      contentContainerStyle={{ padding: 12, gap: 8 }}
      renderItem={({ item: j }) => {
        const bg = clientColor(j.customer?.id);
        const stripe = jobStripeColor(j.id);
        const loc = j.locationOverride ?? j.marina?.name ?? null;
        return (
          <Pressable
            onPress={() => onSelect(j)}
            style={[styles.card, { backgroundColor: bg, borderLeftColor: stripe }]}
          >
            <Text style={styles.time}>{formatTime(j.scheduledStart)} · {j.customer?.name ?? 'Customer'}</Text>
            <Text style={styles.boat}>{j.boat?.name ?? 'Boat'}</Text>
            {loc && <Text style={styles.location}>📍 {loc}</Text>}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#8892A5' },
  card: { borderRadius: 6, borderLeftWidth: 4, padding: 10 },
  time: { color: '#fff', fontWeight: '600', fontSize: 14 },
  boat: { color: '#fff', opacity: 0.9, marginTop: 2 },
  location: { color: '#fff', opacity: 0.75, fontSize: 12, marginTop: 2 },
});
