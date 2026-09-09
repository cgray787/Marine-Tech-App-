import { router } from "expo-router";
import { useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
} from "react-native";
import { useAuth } from "@/lib/auth-context";
import { colors } from "@/constants/Colors";
export function UserMenu() {
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
        accessibilityLabel="Open app menu"
        accessibilityRole="button"
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

            {/* The calendar stays the home screen; management lives here. */}
            {(
              [
                ["Clients", "/(tabs)/clients"],
                ["Jobs", "/(tabs)/jobs"],
                ["Service", "/(tabs)/service"],
                ["PDI", "/(tabs)/pdi"],
              ] as const
            ).map(([label, href]) => (
              <TouchableOpacity
                key={label}
                style={styles.menuItem}
                onPress={() => {
                  setVisible(false);
                  router.push(href);
                }}
              >
                <Text style={styles.menuItemText}>{label}</Text>
              </TouchableOpacity>
            ))}
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
                  "Marine Tech v1.0.0\nBuilt for marine service technicians.",
                );
              }}
            >
              <Text style={styles.menuItemIcon}>&#9432;</Text>
              <Text style={styles.menuItemText}>About</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity style={styles.menuItem} onPress={handleSignOut}>
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

const styles = StyleSheet.create({
  avatarButton: {
    padding: 4,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 12, fontWeight: "600", color: colors.gold },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  menuCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    width: "100%",
    maxWidth: 340,
    overflow: "hidden",
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  menuAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.goldMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  menuAvatarText: { fontSize: 15, fontWeight: "600", color: colors.gold },
  menuName: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
  menuEmail: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  roleBadge: { alignSelf: "flex-start", marginTop: 4 },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.gold,
    letterSpacing: 1,
  },
  menuDivider: { height: 1, backgroundColor: colors.border },
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
  menuItemText: { fontSize: 15, color: colors.textPrimary, fontWeight: "500" },
});
