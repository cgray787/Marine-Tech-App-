import { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { startOfWeek, endOfWeek, format, parseISO } from "date-fns";
import type { CalendarJob } from "@/lib/calendar/types";
import { jobsForDay, jobsForWeek, jobDays } from "@/lib/calendar/spans";
import { techColor, statusStripeColor } from "@/lib/calendar/colors";
import { formatTime } from "@/lib/calendar/format";
import { colors } from "@/constants/Colors";

type Props = {
  scheduledJobs: CalendarJob[];
  unscheduledJobs: CalendarJob[];
  /** The day tapped in the month grid (yyyy-MM-dd) — drives the top section. */
  selectedDate: string;
  weekOf: Date;
  onSelectJob: (job: CalendarJob) => void;
  /** Omit for read-only roles — hides the Schedule button. */
  onScheduleJob?: (job: CalendarJob) => void;
};

export function WeeklyJobsPanel({
  scheduledJobs,
  unscheduledJobs,
  selectedDate,
  weekOf,
  onSelectJob,
  onScheduleJob,
}: Props) {
  const weekStart = startOfWeek(weekOf);
  const weekEnd = endOfWeek(weekOf);
  const weekStartDay = format(weekStart, "yyyy-MM-dd");
  const weekEndDay = format(weekEnd, "yyyy-MM-dd");

  // ① the tapped day's jobs (including multi-day jobs spanning through it)
  const dayJobs = useMemo(
    () => jobsForDay(scheduledJobs, selectedDate),
    [scheduledJobs, selectedDate],
  );

  // ② the rest of the week — distinct jobs whose span touches this week, minus
  // anything already shown under the selected day (no ①/② duplicates).
  const weekJobs = useMemo(
    () =>
      jobsForWeek(scheduledJobs, weekStartDay, weekEndDay).filter(
        (j) => !jobDays(j).includes(selectedDate),
      ),
    [scheduledJobs, weekStartDay, weekEndDay, selectedDate],
  );

  const total = dayJobs.length + weekJobs.length + unscheduledJobs.length;
  const selectedLabel = format(parseISO(selectedDate), "EEEE, MMM d");

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          Week of {format(weekStart, "MMM d")}
        </Text>
        <Text style={styles.headerSub}>
          {dayJobs.length + weekJobs.length} scheduled · {unscheduledJobs.length} unscheduled
        </Text>
      </View>

      {total === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No jobs this week.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {/* ① Selected day */}
          <SectionLabel title={selectedLabel} count={dayJobs.length} accent={colors.gold} />
          {dayJobs.length === 0 ? (
            <Text style={styles.dayEmpty}>Nothing scheduled for this day.</Text>
          ) : (
            dayJobs.map((j) => (
              <JobRow
                key={j.id}
                job={j}
                scheduled
                dayIndex={j.dayIndex}
                dayCount={j.dayCount}
                onSelect={() => onSelectJob(j)}
                onSchedule={onScheduleJob ? () => onScheduleJob(j) : undefined}
              />
            ))
          )}

          {/* ② Rest of the week */}
          {weekJobs.length > 0 && (
            <SectionLabel title="Scheduled this week" count={weekJobs.length} accent="#4ade80" />
          )}
          {weekJobs.map((j) => (
            <JobRow
              key={j.id}
              job={j}
              scheduled
              onSelect={() => onSelectJob(j)}
              onSchedule={onScheduleJob ? () => onScheduleJob(j) : undefined}
            />
          ))}

          {/* ③ Unscheduled */}
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
              onSchedule={onScheduleJob ? () => onScheduleJob(j) : undefined}
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
  dayIndex,
  dayCount,
  onSelect,
  onSchedule,
}: {
  job: CalendarJob;
  scheduled: boolean;
  dayIndex?: number;
  dayCount?: number;
  onSelect: () => void;
  onSchedule?: () => void;
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
            {dayCount != null && dayCount > 1 ? ` · Day ${dayIndex} of ${dayCount}` : ""}
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

      {!scheduled && onSchedule && (
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
  dayEmpty: {
    color: colors.textSecondary,
    fontSize: 12,
    fontStyle: "italic",
    marginHorizontal: 14,
    marginTop: 2,
    marginBottom: 4,
  },
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
