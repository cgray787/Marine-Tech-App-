import { View, Pressable, Text, StyleSheet } from "react-native";
import { colors } from "@/constants/Colors";
import type { CalendarMode } from "@/lib/calendar/navigation";
export type CalendarPanelMode = CalendarMode;
export function ViewToggle({
  value,
  onChange,
}: {
  value: CalendarMode;
  onChange: (mode: CalendarMode) => void;
}) {
  return (
    <View style={styles.bar}>
      {(["month", "week", "day"] as const).map((mode) => (
        <Pressable
          key={mode}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === value }}
          testID={`view-toggle-${mode}`}
          onPress={() => onChange(mode)}
          style={[styles.button, value === mode && styles.active]}
        >
          <Text
            style={{
              color: value === mode ? colors.gold : colors.textSecondary,
              fontWeight: "600",
              fontSize: 14,
            }}
          >
            {mode[0].toUpperCase() + mode.slice(1)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    padding: 8,
    borderTopWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  button: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  active: { backgroundColor: colors.goldMuted },
});
