import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { getJobsInRange } from '@/lib/calendar/queries';
import { subscribeToJobs, unsubscribe } from '@/lib/calendar/realtime';
import { MonthCalendar } from '@/components/calendar/MonthCalendar';
import { DayList } from '@/components/calendar/DayList';
import { JobBottomSheet, JobBottomSheetHandle } from '@/components/calendar/JobBottomSheet';

export default function CalendarScreen() {
  const queryClient = useQueryClient();
  const [monthDate, setMonthDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const sheetRef = useRef<JobBottomSheetHandle>(null);

  const range = useMemo(() => ({
    startUtc: startOfMonth(monthDate).toISOString(),
    endUtc: endOfMonth(monthDate).toISOString(),
  }), [monthDate]);

  const jobsQuery = useQuery({
    queryKey: ['calendar-mobile', range.startUtc, range.endUtc],
    queryFn: () => getJobsInRange(supabase, range.startUtc, range.endUtc),
  });

  useEffect(() => {
    const channel = subscribeToJobs(supabase, () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-mobile'] });
    });
    return () => unsubscribe(supabase, channel);
  }, [queryClient]);

  const jobsForDay = (jobsQuery.data ?? []).filter(
    (j) => j.scheduledStart && j.scheduledStart.slice(0, 10) === selectedDate,
  );

  return (
    <View style={styles.container}>
      <MonthCalendar
        jobs={jobsQuery.data ?? []}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onMonthChange={setMonthDate}
      />
      {jobsQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator color="#C9A96E" /></View>
      ) : (
        <DayList jobs={jobsForDay} onSelect={(j) => sheetRef.current?.present(j)} />
      )}
      <JobBottomSheet ref={sheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060a12' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
