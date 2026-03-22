import { Tabs, router } from "expo-router";
import { useEffect } from "react";
import { Text, View, StyleSheet, TouchableOpacity } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { useOffline } from "@/lib/offline-context";
import { colors } from "@/constants/Colors";

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    "My Jobs": "\uD83C\uDFE0",
    Service: "\uD83D\uDD27",
    PDI: "\uD83D\uDCCB",
  };
  return (
    <View style={styles.iconContainer}>
      <Text style={[styles.icon, focused && styles.iconFocused]}>
        {icons[name] || "?"}
      </Text>
    </View>
  );
}

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
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/login");
    }
  }, [loading, session]);

  if (loading || !session) return null;

  return (
    <View style={styles.wrapper}>
      <OfflineBanner />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.bgSecondary,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 85,
            paddingBottom: 28,
            paddingTop: 8,
          },
          tabBarActiveTintColor: colors.gold,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "My Jobs",
            tabBarIcon: ({ focused }) => (
              <TabIcon name="My Jobs" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="service"
          options={{
            title: "Service",
            tabBarIcon: ({ focused }) => (
              <TabIcon name="Service" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="pdi"
          options={{
            title: "PDI",
            tabBarIcon: ({ focused }) => (
              <TabIcon name="PDI" focused={focused} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 22,
    opacity: 0.5,
  },
  iconFocused: {
    opacity: 1,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    paddingTop: 52,
    gap: 10,
  },
  offlineBannerBg: {
    backgroundColor: "#f59e0b",
  },
  syncingBanner: {
    backgroundColor: "#92400e",
  },
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
  syncBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
});
