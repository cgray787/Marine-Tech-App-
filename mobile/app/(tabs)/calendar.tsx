import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { supabase } from "@/lib/supabase";
import { getJobsInRange } from "@/lib/calendar/queries";
import {
  calendarDays,
  calendarRange,
  moveCalendar,
  type CalendarMode,
} from "@/lib/calendar/navigation";
import type { CalendarJob } from "@/lib/calendar/types";
import { subscribeToJobs, unsubscribe } from "@/lib/calendar/realtime";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { CalendarAgenda } from "@/components/calendar/CalendarAgenda";
import { UserMenu } from "@/components/AppMenu";
import {
  ScheduleSheet,
  type ScheduleSheetHandle,
} from "@/components/ScheduleSheet";
import {
  NewJobSheet,
  type NewJobSheetHandle,
} from "@/components/calendar/NewJobSheet";
import { ViewToggle } from "@/components/calendar/ViewToggle";
import { HourGrid } from "@/components/calendar/HourGrid";
import { useAuth } from "@/lib/auth-context";
import { colors } from "@/constants/Colors";

export default function CalendarScreen() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const agendaHeight = Math.min(
    190,
    Math.max(130, (height - insets.top - insets.bottom) * 0.24),
  );
  const canWrite = ["admin", "manager", "tech", "owner"].includes(
    profile?.role ?? "",
  );
  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [viewMode, setViewMode] = useState<CalendarMode>("month");
  const router = useRouter();
  const scheduleSheetRef = useRef<ScheduleSheetHandle>(null);
  const newJobSheetRef = useRef<NewJobSheetHandle>(null);
  const range = useMemo(
    () => calendarRange(parseISO(selectedDate), viewMode),
    [selectedDate, viewMode],
  );
  const techId = profile?.role === "tech" ? profile.id : undefined;
  const jobsQuery = useQuery({
    queryKey: [
      "calendar-mobile",
      profile?.id,
      techId,
      range.startUtc,
      range.endUtc,
    ],
    queryFn: () =>
      getJobsInRange(supabase, range.startUtc, range.endUtc, techId),
    enabled: !!profile,
  });
  const invalidateCalendar = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["calendar-mobile"] });
    void queryClient.invalidateQueries({
      queryKey: ["calendar-mobile-unscheduled"],
    });
  }, [queryClient]);
  useFocusEffect(
    useCallback(() => {
      invalidateCalendar();
    }, [invalidateCalendar]),
  );
  useEffect(() => {
    const channel = subscribeToJobs(supabase, invalidateCalendar);
    return () => unsubscribe(supabase, channel);
  }, [invalidateCalendar]);
  function openNewJob(day = selectedDate) {
    const date = parseISO(day);
    date.setHours(9, 0, 0, 0);
    newJobSheetRef.current?.present(date.toISOString());
  }
  function selectJob(job: CalendarJob) {
    router.push({ pathname: "/job/[id]", params: { id: job.id } });
  }
  function scheduleJob(job: CalendarJob) {
    scheduleSheetRef.current?.present({
      id: job.id,
      customerName: job.customer?.name ?? "Unassigned",
      boatName: job.boat?.name ?? null,
      currentScheduledStart: job.scheduledStart,
      currentLocation: job.locationOverride ?? job.marina?.name ?? null,
      currentScheduledEndDate: job.scheduledEndDate,
      currentDayLocations: job.dayLocations,
    });
  }
  const jobs = jobsQuery.data ?? [];
  const agenda = (days: string[]) => (
    <CalendarAgenda
      days={days}
      jobs={jobs}
      onSelectJob={selectJob}
      onSelectDay={
        viewMode === "week"
          ? (day) => {
              setSelectedDate(day);
              setViewMode("day");
            }
          : undefined
      }
      onAdd={canWrite ? openNewJob : undefined}
      onSchedule={canWrite ? scheduleJob : undefined}
      refreshing={jobsQuery.isRefetching}
      onRefresh={() => {
        void jobsQuery.refetch();
      }}
    />
  );
  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>
            {techId ? "MY SCHEDULE" : "MARINE TECH"}
          </Text>
          <Text style={styles.title}>
            {format(parseISO(selectedDate), "MMMM yyyy")}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}
          style={styles.control}
        >
          <Text style={styles.controlText}>Today</Text>
        </Pressable>
        <UserMenu />
      </View>
      <View style={styles.navigation}>
        <Pressable
          accessibilityLabel={`Previous ${viewMode}`}
          onPress={() =>
            setSelectedDate(
              format(
                moveCalendar(parseISO(selectedDate), viewMode, -1),
                "yyyy-MM-dd",
              ),
            )
          }
          style={styles.arrow}
        >
          <Text style={styles.arrowText}>‹</Text>
        </Pressable>
        <Text style={styles.period}>
          {viewMode === "month"
            ? "Tap a day to see your jobs"
            : viewMode === "day"
              ? format(parseISO(selectedDate), "EEEE, MMMM d")
              : (() => {
                  const days = calendarDays(parseISO(selectedDate), "week");
                  return `${format(parseISO(days[0]), "MMM d")} – ${format(parseISO(days[6]), "MMM d")}`;
                })()}
        </Text>
        <Pressable
          accessibilityLabel={`Next ${viewMode}`}
          onPress={() =>
            setSelectedDate(
              format(
                moveCalendar(parseISO(selectedDate), viewMode, 1),
                "yyyy-MM-dd",
              ),
            )
          }
          style={styles.arrow}
        >
          <Text style={styles.arrowText}>›</Text>
        </Pressable>
      </View>
      {jobsQuery.isError && (
        <Pressable
          onPress={() => {
            void jobsQuery.refetch();
          }}
          style={styles.error}
        >
          <Text style={{ color: colors.textPrimary }}>
            Couldn’t refresh the calendar. Tap to retry.
          </Text>
        </Pressable>
      )}
      {jobsQuery.isLoading && (
        <ActivityIndicator
          color={colors.gold}
          accessibilityLabel="Loading calendar"
        />
      )}
      {viewMode === "month" ? (
        <View style={{ flex: 1 }}>
          <MonthCalendar
            jobs={jobs}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
          <View style={{ height: agendaHeight }}>{agenda([selectedDate])}</View>
        </View>
      ) : viewMode === "week" ? (
        agenda(calendarDays(parseISO(selectedDate), "week"))
      ) : (
        <View style={{ flex: 1 }}>
          {canWrite && (
            <Pressable style={styles.dayAdd} onPress={() => openNewJob()}>
              <Text style={styles.controlText}>＋ Add job</Text>
            </Pressable>
          )}
          <HourGrid
            jobs={jobs}
            selectedDate={selectedDate}
            onSelectJob={selectJob}
            onScheduleJob={canWrite ? scheduleJob : undefined}
            onTapEmptySlot={
              canWrite
                ? (iso) => newJobSheetRef.current?.present(iso)
                : undefined
            }
          />
        </View>
      )}
      <ViewToggle value={viewMode} onChange={setViewMode} />
      <ScheduleSheet ref={scheduleSheetRef} onScheduled={invalidateCalendar} />
      <NewJobSheet
        ref={newJobSheetRef}
        onCreated={(job) => {
          invalidateCalendar();
          selectJob(job);
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 4,
  },
  title: { color: colors.textPrimary, fontSize: 25, fontWeight: "600" },
  control: { minHeight: 44, justifyContent: "center", paddingHorizontal: 10 },
  controlText: { color: colors.gold, fontSize: 14 },
  navigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  arrow: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowText: { fontSize: 30, color: colors.gold },
  period: { color: colors.textSecondary, fontSize: 12 },
  error: { padding: 12, backgroundColor: colors.bgCard },
  dayAdd: { alignSelf: "flex-end", paddingHorizontal: 18, paddingVertical: 12 },
});
