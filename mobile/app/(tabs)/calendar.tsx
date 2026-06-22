import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, format, parseISO } from "date-fns";
import { supabase } from "@/lib/supabase";
import { getJobsInRange, getUnscheduledJobs } from "@/lib/calendar/queries";
import { subscribeToJobs, unsubscribe } from "@/lib/calendar/realtime";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { WeeklyJobsPanel } from "@/components/calendar/WeeklyJobsPanel";
import {
  JobBottomSheet,
  JobBottomSheetHandle,
} from "@/components/calendar/JobBottomSheet";
import { ScheduleSheet, ScheduleSheetHandle } from "@/components/ScheduleSheet";
import { NewJobSheet, type NewJobSheetHandle } from "@/components/calendar/NewJobSheet";
import { ViewToggle, type CalendarPanelMode } from "@/components/calendar/ViewToggle";
import { HourGrid } from "@/components/calendar/HourGrid";
import { useAuth } from "@/lib/auth-context";
import { colors } from "@/constants/Colors";

/** Matches migration 027: admin, manager, tech can write; viewer cannot. */
function canWriteRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "tech";
}

export default function CalendarScreen() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const canWrite = canWriteRole(profile?.role);
  const [monthDate, setMonthDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [viewMode, setViewMode] = useState<CalendarPanelMode>("week");
  const router = useRouter();
  const sheetRef = useRef<JobBottomSheetHandle>(null);
  const scheduleSheetRef = useRef<ScheduleSheetHandle>(null);
  const newJobSheetRef = useRef<NewJobSheetHandle>(null);

  // Open the create sheet seeded to 9am on the selected day.
  function openNewJob() {
    const d = parseISO(selectedDate);
    d.setHours(9, 0, 0, 0);
    newJobSheetRef.current?.present(d.toISOString());
  }

  function invalidateCalendar() {
    queryClient.invalidateQueries({ queryKey: ["calendar-mobile"] });
    queryClient.invalidateQueries({ queryKey: ["calendar-mobile-unscheduled"] });
  }

  const range = useMemo(
    () => ({
      startUtc: startOfMonth(monthDate).toISOString(),
      endUtc: endOfMonth(monthDate).toISOString(),
    }),
    [monthDate],
  );

  const jobsQuery = useQuery({
    queryKey: ["calendar-mobile", range.startUtc, range.endUtc],
    queryFn: () => getJobsInRange(supabase, range.startUtc, range.endUtc),
  });

  const unscheduledQuery = useQuery({
    queryKey: ["calendar-mobile-unscheduled"],
    queryFn: () => getUnscheduledJobs(supabase),
  });

  useEffect(() => {
    const channel = subscribeToJobs(supabase, () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-mobile"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-mobile-unscheduled"] });
    });
    return () => unsubscribe(supabase, channel);
  }, [queryClient]);

  return (
    <View style={styles.container}>
      <MonthCalendar
        jobs={jobsQuery.data ?? []}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onMonthChange={setMonthDate}
      />
      <ViewToggle value={viewMode} onChange={setViewMode} />
      {jobsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : viewMode === "week" ? (
        <WeeklyJobsPanel
          scheduledJobs={jobsQuery.data ?? []}
          unscheduledJobs={unscheduledQuery.data ?? []}
          selectedDate={selectedDate}
          weekOf={parseISO(selectedDate)}
          onSelectJob={(j) => sheetRef.current?.present(j)}
          onScheduleJob={
            canWrite
              ? (j) =>
                  scheduleSheetRef.current?.present({
                    id: j.id,
                    customerName: j.customer?.name ?? "Unassigned",
                    boatName: j.boat?.name ?? null,
                    currentScheduledStart: j.scheduledStart,
                    currentLocation: j.locationOverride ?? j.marina?.name ?? null,
                    currentScheduledEndDate: j.scheduledEndDate,
                    currentDayLocations: j.dayLocations,
                  })
              : undefined
          }
        />
      ) : (
        <HourGrid
          jobs={jobsQuery.data ?? []}
          selectedDate={selectedDate}
          onSelectJob={(j) => sheetRef.current?.present(j)}
          onScheduleJob={
            canWrite
              ? (j) =>
                  scheduleSheetRef.current?.present({
                    id: j.id,
                    customerName: j.customer?.name ?? "Unassigned",
                    boatName: j.boat?.name ?? null,
                    currentScheduledStart: j.scheduledStart,
                    currentLocation: j.locationOverride ?? j.marina?.name ?? null,
                    currentScheduledEndDate: j.scheduledEndDate,
                    currentDayLocations: j.dayLocations,
                  })
              : undefined
          }
          onTapEmptySlot={
            canWrite
              ? (iso) =>
                  // Every new job goes through the full Service form, with the
                  // tapped slot's start time preselected.
                  router.push({
                    pathname: "/(tabs)/service",
                    params: { newStartIso: iso },
                  })
              : undefined
          }
        />
      )}
      {canWrite && (
        <Pressable style={styles.fab} onPress={openNewJob} testID="calendar-new-job-fab">
          <Text style={styles.fabText}>＋ New</Text>
        </Pressable>
      )}
      <JobBottomSheet ref={sheetRef} />
      <ScheduleSheet ref={scheduleSheetRef} onScheduled={invalidateCalendar} />
      <NewJobSheet ref={newJobSheetRef} onCreated={invalidateCalendar} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  fab: {
    position: "absolute",
    right: 18,
    bottom: 24,
    backgroundColor: colors.gold,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fabText: { color: colors.bgPrimary, fontWeight: "700", fontSize: 14 },
});
