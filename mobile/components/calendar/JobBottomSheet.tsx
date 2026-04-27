import { forwardRef, useMemo, useImperativeHandle, useRef, useState } from 'react';
import { Text, View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import type { CalendarJob } from '@/lib/calendar/types';
import { formatTimeRange } from '@/lib/calendar/format';

export type JobBottomSheetHandle = {
  present: (job: CalendarJob) => void;
  dismiss: () => void;
};

type JobBottomSheetProps = object;

export const JobBottomSheet = forwardRef<JobBottomSheetHandle, JobBottomSheetProps>((_, ref) => {
  const sheetRef = useRef<BottomSheet>(null);
  const [job, setJob] = useState<CalendarJob | null>(null);
  const snapPoints = useMemo(() => ['25%', '60%'], []);

  useImperativeHandle(ref, () => ({
    present: (j) => { setJob(j); sheetRef.current?.snapToIndex(0); },
    dismiss: () => sheetRef.current?.close(),
  }));

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={snapPoints}
      index={-1}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: '#0d1320' }}
      handleIndicatorStyle={{ backgroundColor: '#8892A5' }}
    >
      <BottomSheetView style={styles.body}>
        {job && (
          <>
            <Text style={styles.time}>{formatTimeRange(job.scheduledStart, job.scheduledEnd)}</Text>
            <Text style={styles.customer}>{job.customer?.name ?? 'Customer'}</Text>
            <Text style={styles.boat}>
              {job.boat?.name ?? 'Boat'}{job.boat?.makeModel ? ` · ${job.boat.makeModel}` : ''}
            </Text>
            {(job.locationOverride || job.marina?.name) && (
              <Text style={styles.location}>📍 {job.locationOverride ?? job.marina?.name}</Text>
            )}
            {job.tech && <Text style={styles.tech}>🔧 {job.tech.fullName}</Text>}
            {job.notes && <Text style={styles.notes}>{job.notes}</Text>}
            <Pressable
              onPress={() => { sheetRef.current?.close(); router.push(`/job/${job.id}`); }}
              style={styles.openBtn}
            >
              <Text style={styles.openBtnText}>Open job →</Text>
            </Pressable>
          </>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
});

JobBottomSheet.displayName = 'JobBottomSheet';

const styles = StyleSheet.create({
  body: { padding: 20 },
  time: { color: '#C9A96E', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  customer: { color: '#fff', fontSize: 20, fontWeight: '600', marginBottom: 4 },
  boat: { color: '#8892A5', fontSize: 14, marginBottom: 12 },
  location: { color: '#fff', fontSize: 14, marginBottom: 6 },
  tech: { color: '#fff', fontSize: 14, marginBottom: 6 },
  notes: { color: '#8892A5', fontSize: 12, fontStyle: 'italic', marginTop: 8 },
  openBtn: { marginTop: 16, backgroundColor: '#C9A96E', padding: 12, borderRadius: 8, alignItems: 'center' },
  openBtnText: { color: '#060a12', fontWeight: '700' },
});
