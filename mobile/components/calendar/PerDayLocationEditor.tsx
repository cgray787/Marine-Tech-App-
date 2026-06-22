import { View, Text, TextInput, StyleSheet } from "react-native";
import { format, parseISO } from "date-fns";
import { colors } from "@/constants/Colors";

/** Inclusive list of yyyy-MM-dd days from startDay → endDay. UTC-iterated to
 * match lib/calendar/spans.ts. */
export function daysBetween(startDay: string, endDay: string): string[] {
  if (!startDay) return [];
  if (!endDay || endDay <= startDay) return [startDay];
  const out: string[] = [];
  const cur = new Date(`${startDay}T00:00:00Z`);
  const last = new Date(`${endDay}T00:00:00Z`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime())) return [startDay];
  let guard = 0;
  while (cur <= last && guard < 60) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard += 1;
  }
  return out;
}

type Props = {
  /** Start day, yyyy-MM-dd. */
  startDay: string;
  /** End day, yyyy-MM-dd. Empty / <= start renders nothing (single-day). */
  endDay: string;
  /** Current per-day place map. */
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
};

/**
 * Compact one-place-per-day editor for multi-day jobs. Writes a
 * { "yyyy-MM-dd": "<place>" } map (day_locations). Empty inputs are dropped.
 */
export function PerDayLocationEditor({ startDay, endDay, value, onChange }: Props) {
  const days = daysBetween(startDay, endDay);
  if (days.length < 2) return null;

  function setDay(day: string, text: string) {
    const next = { ...value };
    if (text.trim()) next[day] = text;
    else delete next[day];
    onChange(next);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>PLACE PER DAY (OPTIONAL)</Text>
      {days.map((day) => (
        <View key={day} style={styles.row}>
          <Text style={styles.dayText}>{format(parseISO(day), "EEE MMM d")}</Text>
          <TextInput
            style={styles.input}
            placeholder="Place / marina"
            placeholderTextColor={colors.textSecondary + "80"}
            value={value[day] ?? ""}
            onChangeText={(t) => setDay(day, t)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgPrimary,
    padding: 10,
    gap: 8,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  dayText: {
    color: colors.gold,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    width: 78,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.textPrimary,
  },
});
