import { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { startOfWeek, endOfWeek, isWithinInterval, format } from "date-fns";
import type { CalendarJob } from "@/lib/calendar/types";
import { techColor, statusStripeColor } from "@/lib/calendar/colors";
import { formatTime } from "@/lib/calendar/format";
import { colors } from "@/constants/Colors";

type Props = {
  scheduledJobs: CalendarJob[];
  unscheduledJobs: CalendarJob[];
  weekOf: Date;
  onSelectJob: (job: CalendarJob) => void;
  onScheduleJob: (job: CalendarJob) => void;
};

export function WeeklyJobsPanel({
  scheduledJobs,
  unscheduledJobs,
  weekOf,
  onSelectJob,
  onScheduleJob,
}: Props) {
  const weekStart = startOfWeek(weekOf);
  const weekEnd = endOfWeek(weekOf);

  const thisWeek = useMemo(
    () =>
      scheduledJobs
        .filter(
          (j) =>
            j.scheduledStart &&
            isWithinInterval(new Date(j.scheduledStart), {
              start: weekStart,
              end: weekEnd,
            }),
        )
        .sort((a, b) => (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? "")),
    [scheduledJobs, weekStart, weekEnd],
  );

  const total = thisWeek.length + unscheduledJobs.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          Week of {format(weekStart, "MMM d")}
        </Text>
        <Text style={styles.headerSub}>
          {thisWeek.length} scheduled · {unscheduledJobs.length} unscheduled
        </Text>
      </View>

      {total === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No jobs this week.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {thisWeek.length > 0 && (
            <SectionLabel title="Scheduled this week" count={thisWeek.length} accent="#4ade80" />
          )}
          {thisWeek.map((j) => (
            <JobRow
              key={j.id}
              job={j}
              scheduled
              onSelect={() => onSelectJob(j)}
              onSchedule={() => onScheduleJob(j)}
            />
          ))}

          {unscheduledJobs.length > 0 && (
            <SectionLabel
              title="Unscheduled — needs a time"
              count={unscheduledJobs.length}
              accent="#94a3b8"
            />
          )}
          {unscheduledJobs.map((j) => (
            <JobRow
              key={j.id}
              job={j}
              scheduled={false}
              onSelect={() => onSelectJob(j)}
              onSchedule={() => onScheduleJob(j)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function SectionLabel({
  title,
  count,
  accent,
}: {
  title: string;
  count: number;
  accent: string;
}) {
  return (
    <View style={[styles.sectionLabel, { borderLeftColor: accent }]}>
      <Text style={styles.sectionLabelText}>{title}</Text>
      <Text style={styles.sectionLabelCount}>{count}</Text>
    </View>
  );
}

function JobRow({
  job,
  scheduled,
  onSelect,
  onSchedule,
}: {
  job: CalendarJob;
  scheduled: boolean;
  onSelect: () => void;
  onSchedule: () => void;
}) {
  const tech = job.tech ? techColor(job.tech.id) : "#3b6cd6";
  const stripe = statusStripeColor(job.status);
  const location = job.locationOverride ?? job.marina?.name ?? null;

  return (
    <View style={styles.row}>
      {/* Left side tabs — tech color (or gray if unscheduled) + status stripe */}
      <View style={[styles.sideTab, { backgroundColor: scheduled ? tech : "#1a2236" }]} />
      <View style={[styles.sideTab, { backgroundColor: stripe }]} />

      <Pressable onPress={onSelect} style={styles.rowBody}>
        <View style={styles.rowText}>
          <View style={styles.rowTitleLine}>
            {scheduled && job.scheduledStart && (
              <Text style={styles.timeText}>{formatTime(job.scheduledStart)}</Text>
            )}
            <Text style={styles.customerText} numberOfLines={1}>
              {job.customer?.name ?? "Unassigned"}
            </Text>
          </View>
          <Text style={styles.metaText} numberOfLines={1}>
            {job.boat?.name ?? "No boat"}
            {location ? ` · 📍 ${location}` : ""}
          </Text>
        </View>

        {/* Status badge — the "side tab next to the job" indicator */}
        <View
          style={[
            styles.badge,
            scheduled ? styles.badgeScheduled : styles.badgeUnscheduled,
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              scheduled ? styles.badgeTextScheduled : styles.badgeTextUnscheduled,
            ]}
          >
            {scheduled ? "On calendar" : "Unscheduled"}
          </Text>
        </View>
      </Pressable>

      {!scheduled && (
        <Pressable onPress={onSchedule} style={styles.scheduleBtn}>
          <Text style={styles.scheduleBtnText}>Schedule</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  headerSub: {
    color: colors.textSecondary,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  empty: { padding: 24, alignItems: "center" },
  emptyText: { color: colors.textSecondary, fontSize: 13 },
  sectionLabel: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 6,
    borderLeftWidth: 3,
    backgroundColor: colors.bgSecondary,
    borderRadius: 4,
  },
  sectionLabelText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionLabelCount: { color: colors.textSecondary, fontSize: 11 },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    marginHorizontal: 14,
    marginVertical: 3,
    backgroundColor: colors.bgCard,
    borderRadius: 6,
    overflow: "hidden",
  },
  sideTab: { width: 4 },
  rowBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  timeText: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  customerText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "500",
    flexShrink: 1,
  },
  metaText: { color: colors.textSecondary, fontSize: 12 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeScheduled: { backgroundColor: "#4ade8033" },
  badgeUnscheduled: { backgroundColor: colors.bgSecondary },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  badgeTextScheduled: { color: "#4ade80" },
  badgeTextUnscheduled: { color: colors.textSecondary },
  scheduleBtn: {
    paddingHorizontal: 12,
    justifyContent: "center",
    backgroundColor: colors.gold,
  },
  scheduleBtnText: {
    color: colors.bgPrimary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
