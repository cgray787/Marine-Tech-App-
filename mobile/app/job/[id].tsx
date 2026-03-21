import { useLocalSearchParams } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/constants/Colors";

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Job Summary</Text>
      <Text style={styles.subtext}>Job ID: {id}</Text>
      <Text style={styles.subtext}>Full detail view coming in Phase 4</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  text: {
    fontSize: 24,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  subtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
});
