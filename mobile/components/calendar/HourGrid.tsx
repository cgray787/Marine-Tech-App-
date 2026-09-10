import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View, Text, StyleSheet, Pressable } from "react-native";
import { format, parseISO } from "date-fns";
import type { CalendarJob } from "@/lib/calendar/types";
import { colors } from "@/constants/Colors";
import {
  isMultiDay,
  bucketJobsByHour,
  formatTime,
  formatTimeRange,
} from "@/lib/calendar/format";
import { AllDayStrip } from "./AllDayStrip";

const HOUR_START = 5;       // 5 AM
const HOUR_END   = 20;      // 8 PM (16 rows: 5..20)
const HOUR_HEIGHT = 60;
const LANE_HEIGHT = 48;

type Props = {
  jobs: CalendarJob[];
  selectedDate: string;     // 'yyyy-MM-dd'
  onSelectJob: (job: CalendarJob) => void;
  /** Omit for read-only roles — hides/disables scheduling affordances. */
  onScheduleJob?: (job: CalendarJob) => void;
  /** Omit for read-only roles — empty slots become inert. */
  onTapEmptySlot?: (isoTimestamp: string) => void;
};

export function HourGrid({
  jobs,
  selectedDate,
  onSelectJob,
  onScheduleJob,
  onTapEmptySlot,
}: Props) {
  const { singleDayJobs, multiDayJobs } = useMemo(() => {
    const single: CalendarJob[] = [];
    const multi: CalendarJob[]  = [];
    for (const j of jobs) {
      if (!j.scheduledStart) continue;
      if (isMultiDay(j)) {
        // include only if selectedDate is within the span
        const startDate = format(parseISO(j.scheduledStart), "yyyy-MM-dd");
        if (selectedDate >= startDate && selectedDate <= j.scheduledEndDate!) {
          multi.push(j);
        }
        continue;
      }
      if (format(parseISO(j.scheduledStart), "yyyy-MM-dd") === selectedDate) single.push(j);
    }
    return { singleDayJobs: single, multiDayJobs: multi };
  }, [jobs, selectedDate]);

  const buckets = useMemo(() => bucketJobsByHour(singleDayJobs), [singleDayJobs]);
  const rowHeights = buckets.map(row => Math.max(HOUR_HEIGHT, row.length * LANE_HEIGHT + 8));
  function timeOffset(minutes: number) {
    const hour = Math.max(0, Math.min(rowHeights.length - 1, Math.floor(minutes / 60)));
    return rowHeights.slice(0, hour).reduce((sum, height) => sum + height, 0) + (minutes / 60 - hour) * rowHeights[hour];
  }
  const hasAnyJobs = singleDayJobs.length > 0 || multiDayJobs.length > 0;

  const scrollRef = useRef<ScrollView>(null);
  const [nowMinutes, setNowMinutes] = useState(() => minutesSinceStart(new Date()));
  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const isToday = selectedDate === today;

  // Tick the now-line every minute while mounted
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNowMinutes(minutesSinceStart(new Date())), 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  // Auto-scroll on first mount + on selectedDate change
  useEffect(() => {
    const targetY = isToday
      ? Math.max(0, timeOffset(nowMinutes) - 100)
      : timeOffset((8 - HOUR_START) * 60);      // 8 AM near top on other days
    // RN ScrollView measures after layout; defer to next tick
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: targetY, animated: false }));
    // Intentionally NOT depending on nowMinutes — auto-scroll only on date change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  return (
    <View style={styles.container} testID="hour-grid">
      <AllDayStrip
        jobs={multiDayJobs}
        selectedDate={selectedDate}
        onSelectJob={onSelectJob}
        onScheduleJob={onScheduleJob}
      />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
        {buckets.map((rowJobs, idx) => {
          const hour = HOUR_START + idx;
          const rowHeight = Math.max(HOUR_HEIGHT, rowJobs.length * LANE_HEIGHT + 8);
          return (
            <View key={hour} style={[styles.row, { minHeight: rowHeight }]}>
              <View style={styles.labelCell}>
                <Text style={styles.label}>{formatHourLabel(hour)}</Text>
              </View>
              <View style={styles.slot}>
                {rowJobs.length === 0 ? (
                  <Pressable
                    style={styles.emptySlot}
                    onPress={
                      onTapEmptySlot
                        ? () => onTapEmptySlot(buildIsoSlot(selectedDate, hour))
                        : undefined
                    }
                    testID={`empty-slot-${hour}`}
                  />
                ) : (
                  rowJobs.map((j) => (
                    <JobLane
                      key={j.id}
                      job={j}
                      onPress={() => onSelectJob(j)}
                      onLongPress={onScheduleJob ? () => onScheduleJob(j) : undefined}
                    />
                  ))
                )}
              </View>
            </View>
          );
        })}
        {isToday && nowMinutes >= 0 && nowMinutes <= (HOUR_END - HOUR_START + 1) * 60 && (
          <View
            style={[
              styles.nowLine,
              { top: timeOffset(nowMinutes), pointerEvents: "none" },
            ]}
          >
            <View style={styles.nowDot} />
          </View>
        )}
      </ScrollView>
      {!hasAnyJobs && (
        <View style={[styles.emptyOverlay, { pointerEvents: "none" }]}>
          <Text style={styles.emptyTitle}>No jobs scheduled</Text>
          {onTapEmptySlot && (
            <Text style={styles.emptyHint}>Tap any hour to schedule</Text>
          )}
        </View>
      )}
    </View>
  );
}

function JobLane({
  job,
  onPress,
  onLongPress,
}: {
  job: CalendarJob;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const isPaperwork = job.kind === "paperwork";
  const bg = colors.bgCard;
  const stripe = colors.gold;
  const range  = formatTimeRange(job.scheduledStart, job.scheduledEnd);
  const label  = isPaperwork
    ? `Paperwork${job.notes?.trim() ? ` — ${job.notes.trim()}` : ""}`
    : `${job.customer?.name ?? "Customer"} · ${job.boat?.name ?? "Boat"}`;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      style={[styles.lane, { backgroundColor: bg, borderLeftColor: stripe }]}
      testID={`hour-grid-chip-${job.id}`}
    >
      <Text style={styles.laneText} numberOfLines={2}>
        {range} · {label}
      </Text>
    </Pressable>
  );
}

function formatHourLabel(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;
  return `${h} ${period}`;
}

function minutesSinceStart(now: Date): number {
  // Minutes since HOUR_START (5 AM) — negative if before 5 AM.
  return (now.getHours() - HOUR_START) * 60 + now.getMinutes();
}

function buildIsoSlot(selectedDate: string, hour: number): string {
  // local-time slot at the hour boundary; downstream code interprets in device TZ
  const hh = hour.toString().padStart(2, "0");
  return `${selectedDate}T${hh}:00:00`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060a12" },
  scroll: { paddingBottom: 24 },
  row: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#1a2236",
  },
  labelCell: {
    width: 44,
    paddingTop: 4,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: "#1a2236",
  },
  label: { color: "#8892A5", fontSize: 11, textAlign: "right" },
  slot: { flex: 1, padding: 4, gap: 4 },
  emptySlot: { flex: 1, minHeight: 50 },
  lane: {
    minHeight: 44,
    borderRadius: 4,
    borderLeftWidth: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    justifyContent: "center",
  },
  laneText: { color: "#fff", fontSize: 12, fontWeight: "500" },
  emptyOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyTitle: { color: "#8892A5", fontSize: 16, fontWeight: "500" },
  emptyHint: { color: "#8892A5", fontSize: 12, opacity: 0.8, marginTop: 4 },
  nowLine: {
    position: "absolute",
    left: 44,
    right: 0,
    height: 1,
    backgroundColor: "#ef4444",
    zIndex: 5,
  },
  nowDot: {
    position: "absolute",
    left: -4,
    top: -3,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#ef4444",
  },
});
