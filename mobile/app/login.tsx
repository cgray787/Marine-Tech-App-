import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { colors } from "@/constants/Colors";
import { isAppleSignInAvailable, signInWithApple, signInWithGoogle } from "@/lib/sso";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [ssoLoading, setSsoLoading] = useState<"apple" | "google" | null>(null);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  async function handleApple() {
    setError(null);
    setSsoLoading("apple");
    const result = await signInWithApple();
    setSsoLoading(null);
    if (result.ok === true) {
      router.replace("/(tabs)");
    } else if (result.ok === false) {
      setError(result.error);
    }
  }

  async function handleGoogle() {
    setError(null);
    setSsoLoading("google");
    const result = await signInWithGoogle();
    setSsoLoading(null);
    if (result.ok === true) {
      router.replace("/(tabs)");
    } else if (result.ok === false) {
      setError(result.error);
    }
  }

  async function handleSignIn() {
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setError(null);
    setLoading(true);

    const { error: authError } = await signIn(email.trim(), password);
    if (authError) {
      setError(authError);
      setLoading(false);
    } else {
      router.replace("/(tabs)");
    }
  }

  async function handleForgotPassword() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert(
        "Enter Your Email",
        "Please enter your email address above, then tap Forgot Password."
      );
      return;
    }

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        trimmedEmail,
        { redirectTo: "marine-tech://reset-password" }
      );

      if (resetError) {
        Alert.alert("Error", resetError.message);
      } else {
        setResetSent(true);
        Alert.alert(
          "Check Your Email",
          `If an account exists for ${trimmedEmail}, you'll receive a password reset link.`
        );
      }
    } catch {
      Alert.alert("Error", "Failed to send reset email. Please try again.");
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoIcon}>
            <Text style={styles.anchorEmoji}>{"\u2693"}</Text>
          </View>
          <Text style={styles.logoText}>MARINE TECH</Text>
          <Text style={styles.logoSubtitle}>Service Management</Text>
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Reset sent confirmation */}
        {resetSent && (
          <View style={styles.successBox}>
            <Text style={styles.successText}>
              Password reset email sent. Check your inbox.
            </Text>
          </View>
        )}

        {/* Email */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@company.com"
            placeholderTextColor={colors.textSecondary + "80"}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Password */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter password"
            placeholderTextColor={colors.textSecondary + "80"}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        {/* Sign In Button */}
        <TouchableOpacity
          style={[styles.signInButton, loading && styles.signInButtonDisabled]}
          onPress={handleSignIn}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.bgPrimary} />
          ) : (
            <Text style={styles.signInText}>Sign In</Text>
          )}
        </TouchableOpacity>

        {/* Forgot Password */}
        <TouchableOpacity
          style={styles.forgotButton}
          onPress={handleForgotPassword}
        >
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>

        {/* SSO providers */}
        <View style={styles.ssoDividerRow}>
          <View style={styles.ssoDividerLine} />
          <Text style={styles.ssoDividerText}>or continue with</Text>
          <View style={styles.ssoDividerLine} />
        </View>

        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={10}
            style={styles.appleButton}
            onPress={handleApple}
          />
        )}

        <TouchableOpacity
          style={[styles.googleButton, ssoLoading === "google" && styles.signInButtonDisabled]}
          onPress={handleGoogle}
          disabled={ssoLoading !== null}
          activeOpacity={0.8}
        >
          {ssoLoading === "google" ? (
            <ActivityIndicator color="#1f1f1f" />
          ) : (
            <Text style={styles.googleButtonText}>{"🔒  Continue with Google"}</Text>
          )}
        </TouchableOpacity>

        {/* Create Account */}
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.createAccountButton}
          onPress={() => router.push("/register")}
          activeOpacity={0.8}
        >
          <Text style={styles.createAccountText}>
            New to Marine Tech? <Text style={styles.createAccountBold}>Create a free account</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 48,
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
  },
  successBox: {
    backgroundColor: "#22c55e20",
    borderWidth: 1,
    borderColor: "#22c55e40",
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  successText: {
    color: "#22c55e",
    fontSize: 14,
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
  signInButton: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
  },
  signInButtonDisabled: {
    opacity: 0.6,
  },
  signInText: {
    color: colors.bgPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  forgotButton: {
    alignItems: "center",
    marginTop: 20,
  },
  forgotText: {
    color: colors.gold,
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 32,
    marginBottom: 20,
  },
  ssoDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 28,
    marginBottom: 16,
  },
  ssoDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  ssoDividerText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginHorizontal: 12,
    letterSpacing: 1,
  },
  appleButton: {
    height: 50,
    width: "100%",
    marginBottom: 12,
  },
  googleButton: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  googleButtonText: {
    color: "#1f1f1f",
    fontSize: 16,
    fontWeight: "600",
  },
  createAccountButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  createAccountText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  createAccountBold: {
    color: colors.gold,
    fontWeight: "600",
  },
});
