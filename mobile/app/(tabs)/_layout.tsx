import { Stack, router } from "expo-router";
import { useEffect } from "react";
import { Text, View, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { useOffline } from "@/lib/offline-context";
import { colors } from "@/constants/Colors";

function OfflineBanner() {
  const { isOnline, pendingCount, isSyncing, syncNow } = useOffline();

  if (isOnline && pendingCount === 0) return null;

  return (
    <View
      style={[
        styles.offlineBanner,
        isOnline ? styles.syncingBanner : styles.offlineBannerBg,
      ]}
    >
      <Text style={styles.offlineBannerText}>
        {!isOnline
          ? "Offline \u2014 changes will sync when connected"
          : isSyncing
            ? `Syncing ${pendingCount} pending item${pendingCount !== 1 ? "s" : ""}...`
            : `${pendingCount} item${pendingCount !== 1 ? "s" : ""} pending sync`}
      </Text>
      {isOnline && pendingCount > 0 && !isSyncing && (
        <TouchableOpacity onPress={syncNow} style={styles.syncBtn}>
          <Text style={styles.syncBtnText}>Sync Now</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function TabLayout() {
  const { session, profile, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/login");
    }
  }, [loading, session]);

  // Non-active tech accounts: sign them out and show a clear message.
  // Schema CHECK constraint: status IN ('active', 'invited', 'disabled')
  useEffect(() => {
    if (
      !loading &&
      session &&
      profile &&
      profile.status &&
      profile.status !== "active"
    ) {
      const label =
        profile.status === "invited" ? "pending approval" : "disabled";
      Alert.alert(
        "Account not active",
        `Your account is ${label}. Please contact your admin.`,
        [
          {
            text: "OK",
            onPress: async () => {
              await signOut();
              router.replace("/login");
            },
          },
        ],
      );
    }
  }, [loading, session, profile, signOut]);

  if (loading || !session) return null;
  if (profile && profile.status && profile.status !== "active") return null;

  return (
    <View style={styles.wrapper}>
      <OfflineBanner />
      <Stack
        initialRouteName="calendar"
        screenOptions={{
          headerStyle: { backgroundColor: colors.bgPrimary },
          headerTintColor: colors.textPrimary,
          contentStyle: { backgroundColor: colors.bgPrimary },
          headerLeft: () => (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Back to calendar"
              onPress={() => router.dismissTo("/(tabs)/calendar")}
              style={{ paddingRight: 16, paddingVertical: 8 }}
            >
              <Text style={{ color: colors.gold }}>‹ Calendar</Text>
            </TouchableOpacity>
          ),
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="calendar" options={{ headerShown: false }} />
        <Stack.Screen name="clients" options={{ title: "Clients" }} />
        <Stack.Screen name="jobs" options={{ title: "Jobs" }} />
        <Stack.Screen name="service" options={{ title: "Service" }} />
        <Stack.Screen name="pdi" options={{ title: "PDI" }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: colors.bgPrimary },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 10,
  },
  offlineBannerBg: { backgroundColor: "#f59e0b" },
  syncingBanner: { backgroundColor: "#92400e" },
  offlineBannerText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  syncBtn: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  syncBtnText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
});
