import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { colors } from "@/constants/Colors";

export default function AccountSettingsScreen() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [saving, setSaving] = useState(false);

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Account deletion
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    if (deleteConfirm !== "DELETE") {
      Alert.alert("Confirmation required", 'Type DELETE in all caps to confirm.');
      return;
    }
    Alert.alert(
      "Delete account?",
      "This permanently removes your account and all associated data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete forever",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            const { error } = await supabase.rpc("delete_user_account");
            if (error) {
              setDeleting(false);
              Alert.alert("Error", error.message);
              return;
            }
            await signOut();
            router.replace("/login");
          },
        },
      ]
    );
  }

  async function handleSaveProfile() {
    if (!profile) return;
    if (!fullName.trim()) {
      Alert.alert("Error", "Name cannot be empty.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
      })
      .eq("id", profile.id);

    setSaving(false);
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      await refreshProfile();
      Alert.alert("Saved", "Your profile has been updated.");
    }
  }

  async function handleChangePassword() {
    if (!newPassword || newPassword.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setChangingPassword(false);
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Success", "Your password has been changed.");
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>{"<"} Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Account Settings</Text>
      </View>

      {/* Profile Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <View style={styles.readOnlyField}>
            <Text style={styles.readOnlyText}>{profile?.email || ""}</Text>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            placeholderTextColor={colors.textSecondary + "80"}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone number"
            placeholderTextColor={colors.textSecondary + "80"}
            keyboardType="phone-pad"
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.btnDisabled]}
          onPress={handleSaveProfile}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.bgPrimary} />
          ) : (
            <Text style={styles.saveBtnText}>Save Profile</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Password Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Change Password</Text>

        <View style={styles.field}>
          <Text style={styles.label}>New Password</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Min 8 characters"
            placeholderTextColor={colors.textSecondary + "80"}
            secureTextEntry
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repeat new password"
            placeholderTextColor={colors.textSecondary + "80"}
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, changingPassword && styles.btnDisabled]}
          onPress={handleChangePassword}
          disabled={changingPassword}
        >
          {changingPassword ? (
            <ActivityIndicator color={colors.bgPrimary} />
          ) : (
            <Text style={styles.saveBtnText}>Change Password</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.infoText}>Marine Tech v1.0.0</Text>
        <Text style={styles.infoText}>Built for marine service technicians</Text>
        <Text style={[styles.infoText, { marginTop: 8 }]}>
          Role: {profile?.role?.toUpperCase() || "TECH"}
        </Text>
      </View>

      {/* Delete Account */}
      <View style={[styles.section, styles.dangerSection, { marginBottom: 40 }]}>
        <Text style={[styles.sectionTitle, styles.dangerTitle]}>Delete Account</Text>
        <Text style={styles.infoText}>
          Permanently delete your account and all associated data: customers,
          boats, jobs, and reports you created. This cannot be undone.
        </Text>
        <View style={[styles.field, { marginTop: 16 }]}>
          <Text style={styles.label}>Type DELETE to confirm</Text>
          <TextInput
            style={styles.input}
            value={deleteConfirm}
            onChangeText={setDeleteConfirm}
            placeholder="DELETE"
            placeholderTextColor={colors.textSecondary + "80"}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
        <TouchableOpacity
          style={[
            styles.deleteBtn,
            (deleteConfirm !== "DELETE" || deleting) && styles.btnDisabled,
          ]}
          onPress={handleDeleteAccount}
          disabled={deleteConfirm !== "DELETE" || deleting}
        >
          {deleting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.deleteBtnText}>Delete My Account</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    marginBottom: 12,
  },
  backText: {
    color: colors.gold,
    fontSize: 16,
    fontWeight: "500",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  section: {
    marginTop: 24,
    marginHorizontal: 20,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 16,
  },
  readOnlyField: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    opacity: 0.6,
  },
  readOnlyText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  saveBtn: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: colors.bgPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
  dangerSection: {
    borderColor: "#7a1f1f",
  },
  dangerTitle: {
    color: "#ef4444",
  },
  deleteBtn: {
    backgroundColor: "#dc2626",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  deleteBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
