import { View, Text, Pressable, StyleSheet } from "react-native";
import { format, parseISO } from "date-fns";
import { colors } from "@/constants/Colors";
import { calendarDays } from "@/lib/calendar/navigation";
import { jobsForDay } from "@/lib/calendar/spans";
import type { CalendarJob } from "@/lib/calendar/types";
export function MonthCalendar({
  jobs,
  selectedDate,
  onSelectDate,
}: {
  jobs: CalendarJob[];
  selectedDate: string;
  onSelectDate: (day: string) => void;
}) {
  const days = calendarDays(parseISO(selectedDate), "month");
  const rows = Array.from({ length: days.length / 7 }, (_, i) =>
    days.slice(i * 7, i * 7 + 7),
  );
  const today = format(new Date(), "yyyy-MM-dd");
  return (
    <View style={styles.calendar}>
      <View style={styles.weekdays}>
        {["S", "M", "T", "W", "T", "F", "S"].map((label, i) => (
          <Text key={i} style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>
      {rows.map((week, i) => (
        <View key={i} style={styles.week}>
          {week.map((day) => {
            const items = jobsForDay(jobs, day);
            return (
              <Pressable
                key={day}
                testID={`calendar-date-${day}`}
                accessibilityRole="button"
                accessibilityLabel={`${format(parseISO(day), "EEEE MMMM d")}, ${items.length} jobs`}
                accessibilityState={{ selected: day === selectedDate }}
                onPress={() => onSelectDate(day)}
                style={[
                  styles.cell,
                  day === selectedDate && styles.selected,
                  day.slice(0, 7) !== selectedDate.slice(0, 7) && {
                    opacity: 0.45,
                  },
                ]}
              >
                <Text style={[styles.date, day === today && styles.today]}>
                  {Number(day.slice(8))}
                </Text>
                {items.slice(0, 2).map((job) => (
                  <Text key={job.id} numberOfLines={1} style={styles.job}>
                    {job.boat?.name ||
                      job.customer?.name ||
                      (job.kind === "paperwork" ? "Paperwork" : "Service")}
                  </Text>
                ))}
                {items.length > 2 && (
                  <Text style={styles.more}>+{items.length - 2} more</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  calendar: { flex: 1, minHeight: 260 },
  weekdays: { flexDirection: "row", paddingVertical: 8 },
  weekday: {
    flex: 1,
    textAlign: "center",
    color: colors.textSecondary,
    fontSize: 11,
  },
  week: { flex: 1, flexDirection: "row" },
  cell: {
    flex: 1,
    paddingHorizontal: 3,
    paddingTop: 5,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  selected: { backgroundColor: colors.goldMuted },
  date: {
    color: colors.textPrimary,
    fontSize: 13,
    textAlign: "center",
    alignSelf: "center",
    width: 25,
    lineHeight: 25,
    borderRadius: 13,
    overflow: "hidden",
    marginBottom: 3,
  },
  today: {
    backgroundColor: colors.gold,
    color: colors.bgPrimary,
    fontWeight: "700",
  },
  job: {
    color: colors.textPrimary,
    fontSize: 10,
    lineHeight: 15,
    paddingLeft: 3,
    borderLeftWidth: 2,
    borderColor: colors.gold,
    marginBottom: 2,
  },
  more: { color: colors.gold, fontSize: 9 },
});
