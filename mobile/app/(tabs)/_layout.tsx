import { Tabs, router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
} from "react-native";
import { useAuth } from "@/lib/auth-context";
import { useOffline } from "@/lib/offline-context";
import { colors } from "@/constants/Colors";

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Clients: "\uD83D\uDC64",
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

function UserMenu() {
  const { profile, signOut } = useAuth();
  const [visible, setVisible] = useState(false);

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  function handleSignOut() {
    setVisible(false);
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  }

  return (
    <>
      <TouchableOpacity
        style={styles.avatarButton}
        onPress={() => setVisible(true)}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <View style={styles.menuCard}>
            {/* User Info */}
            <View style={styles.menuHeader}>
              <View style={styles.menuAvatar}>
                <Text style={styles.menuAvatarText}>{initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuName}>
                  {profile?.full_name || "User"}
                </Text>
                <Text style={styles.menuEmail}>{profile?.email || ""}</Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>
                    {profile?.role?.toUpperCase() || "TECH"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.menuDivider} />

            {/* Menu Items */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setVisible(false);
                router.push("/account-settings" as never);
              }}
            >
              <Text style={styles.menuItemIcon}>&#9881;</Text>
              <Text style={styles.menuItemText}>Account Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setVisible(false);
                Alert.alert(
                  "About",
                  "Marine Tech v1.0.0\nBuilt for marine service technicians."
                );
              }}
            >
              <Text style={styles.menuItemIcon}>&#9432;</Text>
              <Text style={styles.menuItemText}>About</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleSignOut}
            >
              <Text style={[styles.menuItemIcon, { color: colors.bad }]}>
                &#10140;
              </Text>
              <Text style={[styles.menuItemText, { color: colors.bad }]}>
                Sign Out
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function HeaderBar() {
  return (
    <View style={styles.headerBar}>
      <View style={styles.headerLeft}>
        <Text style={styles.headerAnchor}>&#9875;</Text>
        <Text style={styles.headerTitle}>MARINE TECH</Text>
      </View>
      <UserMenu />
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
      <HeaderBar />
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
            title: "Clients",
            tabBarIcon: ({ focused }) => (
              <TabIcon name="Clients" focused={focused} />
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
  // Header bar
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 54,
    paddingBottom: 12,
    paddingHorizontal: 20,
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerAnchor: {
    fontSize: 22,
    color: colors.gold,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.gold,
    letterSpacing: 2,
  },
  // Avatar button
  avatarButton: {
    padding: 4,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.bgPrimary,
  },
  // Modal overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 100,
    paddingRight: 16,
  },
  menuCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    width: 280,
    overflow: "hidden",
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  menuAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  menuAvatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.bgPrimary,
  },
  menuName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  menuEmail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: colors.gold + "20",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.gold,
    letterSpacing: 1,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuItemIcon: {
    fontSize: 18,
    color: colors.textSecondary,
    width: 24,
    textAlign: "center",
  },
  menuItemText: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: "500",
  },
  // Tab icons
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
  // Offline banner
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
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
