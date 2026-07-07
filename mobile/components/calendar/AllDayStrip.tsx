import { View, Text, StyleSheet, Pressable } from "react-native";
import type { CalendarJob } from "@/lib/calendar/types";
import { clientColor, statusStripeColor } from "@/lib/calendar/colors";
import { dayOfN } from "@/lib/calendar/format";
import { placeForDay } from "@/lib/calendar/spans";

type Props = {
  jobs: CalendarJob[];
  selectedDate: string;
  onSelectJob: (job: CalendarJob) => void;
  /** Omit for read-only roles — long-press scheduling disabled. */
  onScheduleJob?: (job: CalendarJob) => void;
};

export function AllDayStrip({ jobs, selectedDate, onSelectJob, onScheduleJob }: Props) {
  if (jobs.length === 0) return null;
  return (
    <View style={styles.container} testID="all-day-strip">
      {jobs.map((j) => {
        const isPaperwork = j.kind === "paperwork";
        const bg = isPaperwork ? "#334155" : clientColor(j.customer?.id);
        const stripe = isPaperwork ? "#C9A96E" : statusStripeColor(j.status);
        const { day, total } = dayOfN(
          selectedDate,
          j.scheduledStart!,
          j.scheduledEndDate!,
        );
        // Per-day place for the spanned day in view.
        const place = placeForDay(j, selectedDate);
        const title = isPaperwork
          ? `📋 Paperwork${j.notes?.trim() ? ` — ${j.notes.trim()}` : ""}${place ? ` · 📍 ${place}` : ""}`
          : `🛠 ${j.customer?.name ?? "Customer"} · ${j.boat?.name ?? "Boat"}${place ? ` · 📍 ${place}` : ""}`;
        return (
          <Pressable
            key={j.id}
            onPress={() => onSelectJob(j)}
            onLongPress={onScheduleJob ? () => onScheduleJob(j) : undefined}
            delayLongPress={500}
            style={[styles.chip, { backgroundColor: bg, borderLeftColor: stripe }]}
            testID={`all-day-chip-${j.id}`}
          >
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.badge}>DAY {day}/{total}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0d1320",
    borderBottomWidth: 1,
    borderBottomColor: "#1a2236",
    padding: 6,
    gap: 4,
  },
  chip: {
    borderRadius: 4,
    borderLeftWidth: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: "#fff", fontSize: 11, flex: 1, marginRight: 8 },
  badge: { color: "#fff", fontSize: 9, opacity: 0.75 },
});
