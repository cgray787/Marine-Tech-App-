import { View, Pressable, Text, StyleSheet } from "react-native";

export type CalendarPanelMode = "week" | "day";

type Props = {
  value: CalendarPanelMode;
  onChange: (mode: CalendarPanelMode) => void;
};

export function ViewToggle({ value, onChange }: Props) {
  return (
    <View style={styles.container}>
      <ToggleButton
        label="Week"
        active={value === "week"}
        onPress={() => onChange("week")}
        testID="view-toggle-week"
      />
      <ToggleButton
        label="Day"
        active={value === "day"}
        onPress={() => onChange("day")}
        testID="view-toggle-day"
      />
    </View>
  );
}

function ToggleButton({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={[styles.label, active ? styles.active : styles.inactive]}>{label}</Text>
      {active && <View style={styles.underline} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    height: 36,
    backgroundColor: "#0d1320",
    borderBottomWidth: 1,
    borderBottomColor: "#1a2236",
  },
  button: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  pressed: { backgroundColor: "rgba(201,169,110,0.08)" },
  label: { fontSize: 13, fontWeight: "600" },
  active: { color: "#C9A96E" },
  inactive: { color: "#8892A5" },
  underline: {
    position: "absolute",
    bottom: 0,
    left: "20%",
    right: "20%",
    height: 2,
    backgroundColor: "#C9A96E",
  },
});
