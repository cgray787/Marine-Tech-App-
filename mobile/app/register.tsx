import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors } from "@/constants/Colors";

export default function RegisterScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenValid, setTokenValid] = useState(false);

  // Validate the invite token on mount
  useEffect(() => {
    validateToken();
  }, [token]);

  async function validateToken() {
    if (!token) {
      setError("No invite token provided. Please use the invite link sent by your admin.");
      setValidating(false);
      return;
    }

    const { data: invite, error: inviteError } = await supabase
      .from("invites")
      .select("*")
      .eq("token", token)
      .single();

    if (inviteError || !invite) {
      setError("Invalid invite token. Please contact your admin for a new invite.");
      setValidating(false);
      return;
    }

    // Check if already used
    if (invite.used_at) {
      setError("This invite has already been used. Please contact your admin if you need a new one.");
      setValidating(false);
      return;
    }

    // Check expiration
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      setError("This invite has expired. Please contact your admin for a new invite.");
      setValidating(false);
      return;
    }

    // Pre-fill email from invite
    setEmail(invite.email || "");
    setTokenValid(true);
    setValidating(false);
  }

  async function handleRegister() {
    setError(null);

    // Validation
    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (!password) {
      setError("Please enter a password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      // 1. Create Supabase auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: "tech",
          },
        },
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError("Account creation failed. Please try again.");
        setLoading(false);
        return;
      }

      // 2. Update profile (may already exist from invite) or insert new one
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            auth_id: authData.user.id,
            email: email.trim(),
            full_name: fullName.trim(),
            role: "tech",
            status: "active",
          },
          { onConflict: "email" }
        );

      if (profileError) {
        console.warn("Profile upsert error:", profileError.message);
        // Non-fatal: profile may have been created by the admin invite flow
      }

      // 3. Mark invite as used
      await supabase
        .from("invites")
        .update({ used_at: new Date().toISOString() })
        .eq("token", token);

      // 4. Sign out so the tech can sign in fresh on the login screen
      await supabase.auth.signOut();

      Alert.alert(
        "Account Created",
        "Your account has been set up successfully. Please sign in with your email and password.",
        [
          {
            text: "Go to Login",
            onPress: () => router.replace("/login"),
          },
        ]
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // Loading state while validating token
  if (validating) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.gold} />
        <Text style={styles.validatingText}>Validating invite...</Text>
      </View>
    );
  }

  // Invalid token state
  if (!tokenValid) {
    return (
      <View style={[styles.container, styles.centered]}>
        <View style={styles.logoContainer}>
          <View style={styles.logoIcon}>
            <Text style={styles.anchorEmoji}>{"\u2693"}</Text>
          </View>
          <Text style={styles.logoText}>MARINE TECH</Text>
        </View>

        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace("/login")}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>Go to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoIcon}>
            <Text style={styles.anchorEmoji}>{"\u2693"}</Text>
          </View>
          <Text style={styles.logoText}>MARINE TECH</Text>
          <Text style={styles.logoSubtitle}>Create Your Account</Text>
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            You have been invited to join as a technician. Complete the form below to set up your account.
          </Text>
        </View>

        {/* Full Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="John Smith"
            placeholderTextColor={colors.textSecondary + "80"}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        {/* Email */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            placeholder="you@company.com"
            placeholderTextColor={colors.textSecondary + "80"}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={false}
          />
          <Text style={styles.helperText}>
            Email is set from your invite and cannot be changed.
          </Text>
        </View>

        {/* Password */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.textSecondary + "80"}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        {/* Confirm Password */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Re-enter password"
            placeholderTextColor={colors.textSecondary + "80"}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
        </View>

        {/* Register Button */}
        <TouchableOpacity
          style={[styles.registerButton, loading && styles.registerButtonDisabled]}
          onPress={handleRegister}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.bgPrimary} />
          ) : (
            <Text style={styles.registerText}>Create Account</Text>
          )}
        </TouchableOpacity>

        {/* Already have account */}
        <TouchableOpacity
          style={styles.loginLink}
          onPress={() => router.replace("/login")}
        >
          <Text style={styles.loginLinkText}>
            Already have an account? <Text style={styles.loginLinkBold}>Sign In</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  validatingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 16,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 36,
  },
  logoIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  anchorEmoji: {
    fontSize: 32,
    color: colors.bgPrimary,
  },
  logoText: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: 4,
  },
  logoSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
    letterSpacing: 1,
  },
  errorBox: {
    backgroundColor: colors.bad + "20",
    borderWidth: 1,
    borderColor: colors.bad + "40",
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  errorText: {
    color: colors.bad,
    fontSize: 14,
    textAlign: "center",
  },
  infoBanner: {
    backgroundColor: colors.gold + "15",
    borderWidth: 1,
    borderColor: colors.gold + "30",
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
  },
  infoBannerText: {
    color: colors.gold,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 16,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },
  registerButton: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
  },
  registerButtonDisabled: {
    opacity: 0.6,
  },
  registerText: {
    color: colors.bgPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  loginLink: {
    alignItems: "center",
    marginTop: 20,
  },
  loginLinkText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  loginLinkBold: {
    color: colors.gold,
    fontWeight: "600",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.gold + "50",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 20,
  },
  secondaryButtonText: {
    color: colors.gold,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
});
