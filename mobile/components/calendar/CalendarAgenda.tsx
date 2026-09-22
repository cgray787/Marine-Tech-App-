import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { format, parseISO } from "date-fns";
import { colors } from "@/constants/Colors";
import { jobsForDay, placeForDay } from "@/lib/calendar/spans";
import type { CalendarJob } from "@/lib/calendar/types";
export function CalendarAgenda({
  days,
  jobs,
  onSelectJob,
  onSelectDay,
  onAdd,
  onSchedule,
  refreshing,
  onRefresh,
}: {
  days: string[];
  jobs: CalendarJob[];
  onSelectJob: (job: CalendarJob) => void;
  onSelectDay?: (day: string) => void;
  onAdd?: (day: string) => void;
  onSchedule?: (job: CalendarJob) => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 16 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.gold}
        />
      }
    >
      {days.map((day) => {
        const items = jobsForDay(jobs, day);
        return (
          <View key={day} style={styles.section}>
            <View style={styles.header}>
              <Pressable
                disabled={!onSelectDay}
                onPress={() => onSelectDay?.(day)}
                style={{ flex: 1, paddingVertical: 12 }}
              >
                <Text style={styles.heading}>
                  {format(parseISO(day), "EEEE, MMM d")}
                </Text>
              </Pressable>
              {onAdd && (
                <Pressable
                  accessibilityLabel={`Add job on ${day}`}
                  onPress={() => onAdd(day)}
                  style={styles.add}
                >
                  <Text style={{ color: colors.gold, fontSize: 14 }}>
                    ＋ Add job
                  </Text>
                </Pressable>
              )}
            </View>
            {items.length === 0 ? (
              <Text style={styles.empty}>No jobs scheduled</Text>
            ) : (
              items.map((job) => (
                <Pressable
                  key={job.id}
                  onPress={() => onSelectJob(job)}
                  onLongPress={onSchedule ? () => onSchedule(job) : undefined}
                  accessibilityRole="button"
                  style={styles.job}
                >
                  <Text style={styles.time}>
                    {job.dayCount > 1
                      ? `Day ${job.dayIndex} of ${job.dayCount}`
                      : job.scheduledStart
                        ? format(parseISO(job.scheduledStart), "h:mm a")
                        : ""}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>
                      {job.customer?.name ||
                        (job.kind === "paperwork" ? "Paperwork" : "Unassigned")}
                    </Text>
                    <Text numberOfLines={1} style={styles.detail}>
                      {[
                        job.boat?.name,
                        placeForDay(job, day),
                      ]
                        .filter(Boolean)
                        .join(" · ") ||
                        (job.kind === "paperwork"
                          ? job.notes || "Paperwork"
                          : "Service")}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textSecondary }}>›</Text>
                </Pressable>
              ))
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  header: { flexDirection: "row", alignItems: "center" },
  heading: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  add: { paddingVertical: 14, paddingLeft: 12 },
  empty: { color: colors.textSecondary, paddingBottom: 18, fontSize: 13 },
  job: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  time: { color: colors.gold, width: 65, fontSize: 12 },
  title: { color: colors.textPrimary, fontSize: 15, fontWeight: "500" },
  detail: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
});
