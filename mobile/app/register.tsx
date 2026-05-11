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

type AccountKind = "mechanic" | "owner";

export default function RegisterScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const isInviteFlow = Boolean(token);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [kind, setKind] = useState<AccountKind>("mechanic");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(isInviteFlow);
  const [error, setError] = useState<string | null>(null);
  const [tokenValid, setTokenValid] = useState(false);

  useEffect(() => {
    if (isInviteFlow) validateToken();
  }, [token]);

  async function validateToken() {
    const { data: inviteRows, error: inviteError } = await supabase
      .rpc("validate_invite_token", { invite_token: token });

    const invite = inviteRows?.[0] ?? null;

    if (inviteError || !invite) {
      setError("Invalid or expired invite link. Please contact your shop admin for a new invite, or create a free personal account instead.");
      setValidating(false);
      return;
    }

    setEmail(invite.email || "");
    setTokenValid(true);
    setValidating(false);
  }

  async function handleRegister() {
    setError(null);

    if (!fullName.trim()) return setError("Please enter your full name.");
    if (!email.trim()) return setError("Please enter your email address.");
    if (!password) return setError("Please enter a password.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");

    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: kind === "owner" ? "owner" : "tech",
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

      // Profile creation is handled by an auth.users INSERT trigger
      // (handle_new_user, migration 013) that runs SECURITY DEFINER so it
      // bypasses RLS. The trigger reads role from raw_user_meta_data which
      // we set in signUp() above.

      if (isInviteFlow) {
        await supabase.from("invites").update({ used: true }).eq("token", token);
      }

      // If signUp returned a session, the user is already signed in — go
      // straight to the app. Otherwise (email confirmation enabled at the
      // project level) fall back to explicit sign-in.
      if (authData.session) {
        router.replace("/(tabs)");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(
          `Account created but auto sign-in failed: ${signInError.message}. Please use the sign-in screen.`
        );
        setLoading(false);
        return;
      }

      router.replace("/(tabs)");
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (validating) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.gold} />
        <Text style={styles.validatingText}>Validating invite...</Text>
      </View>
    );
  }

  if (isInviteFlow && !tokenValid) {
    return (
      <View style={[styles.container, styles.centered]}>
        <View style={styles.logoContainer}>
          <View style={styles.logoIcon}>
            <Text style={styles.anchorEmoji}>{"⚓"}</Text>
          </View>
          <Text style={styles.logoText}>MARINE TECH</Text>
        </View>

        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace("/register")}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>Create Free Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, { marginTop: 12 }]}
          onPress={() => router.replace("/login")}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>Go to Sign In</Text>
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
        <View style={styles.logoContainer}>
          <View style={styles.logoIcon}>
            <Text style={styles.anchorEmoji}>{"⚓"}</Text>
          </View>
          <Text style={styles.logoText}>MARINE TECH</Text>
          <Text style={styles.logoSubtitle}>Create Your Account</Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {isInviteFlow ? (
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>
              You have been invited to join your shop on Marine Tech. Complete the form below to set up your account.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>
                Free account · Unlimited customers, jobs, and reports
              </Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>I am a...</Text>
              <View style={styles.kindRow}>
                <TouchableOpacity
                  style={[styles.kindButton, kind === "mechanic" && styles.kindButtonActive]}
                  onPress={() => setKind("mechanic")}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.kindText, kind === "mechanic" && styles.kindTextActive]}>
                    Marine Mechanic
                  </Text>
                  <Text style={styles.kindSub}>Track customer boats, jobs, reports</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.kindButton, kind === "owner" && styles.kindButtonActive]}
                  onPress={() => setKind("owner")}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.kindText, kind === "owner" && styles.kindTextActive]}>
                    Boat Owner
                  </Text>
                  <Text style={styles.kindSub}>Maintain a service log for my own boats</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

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

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, isInviteFlow && styles.inputDisabled]}
            placeholder="you@example.com"
            placeholderTextColor={colors.textSecondary + "80"}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isInviteFlow}
          />
          {isInviteFlow && (
            <Text style={styles.helperText}>
              Email is set from your invite and cannot be changed.
            </Text>
          )}
        </View>

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
  kindRow: {
    flexDirection: "row",
    gap: 12,
  },
  kindButton: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    alignItems: "flex-start",
  },
  kindButtonActive: {
    borderColor: colors.gold,
    backgroundColor: colors.gold + "10",
  },
  kindText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  kindTextActive: {
    color: colors.gold,
  },
  kindSub: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 14,
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
