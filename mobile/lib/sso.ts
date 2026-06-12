// Apple + Google Sign-In via Supabase signInWithIdToken.
//
// Apple: native expo-apple-authentication (iOS only)
// Google: expo-auth-session OAuth implicit flow (works on iOS + Android)
//
// Server-side OAuth providers must be configured in the Supabase dashboard
// (Authentication → Providers → Apple/Google). The client IDs / Service IDs
// referenced here must match what's set there. See docs/SSO_SETUP.md.

import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

// Google OAuth iOS client ID. Set in Supabase Dashboard → Google provider →
// "Authorized Client IDs (for use with Sign In with Google on iOS)". The value
// is read from app.json extra config so it can be overridden per environment.
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "";
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

async function sha256(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  return AppleAuthentication.isAvailableAsync();
}

export type SsoResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: "canceled" };

export async function signInWithApple(): Promise<SsoResult> {
  try {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await sha256(rawNonce);

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      return { ok: false, error: "Apple did not return an identity token." };
    }

    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(" ")
      .trim();

    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
      nonce: rawNonce,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    // If Apple returned a name (only on first sign-in), persist it so the
    // profile trigger's fallback to email doesn't leave the user nameless.
    if (fullName) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user?.id) {
        await supabase
          .from("profiles")
          .update({ full_name: fullName })
          .eq("auth_id", userData.user.id);
      }
    }

    return { ok: true };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "ERR_REQUEST_CANCELED" || err.code === "ERR_CANCELED") {
      return { ok: "canceled" };
    }
    return { ok: false, error: err.message ?? "Apple sign-in failed." };
  }
}

export async function signInWithGoogle(): Promise<SsoResult> {
  if (!GOOGLE_IOS_CLIENT_ID && !GOOGLE_WEB_CLIENT_ID) {
    return {
      ok: false,
      error: "Google sign-in is not configured for this build.",
    };
  }

  try {
    const clientId =
      Platform.OS === "ios" && GOOGLE_IOS_CLIENT_ID
        ? GOOGLE_IOS_CLIENT_ID
        : GOOGLE_WEB_CLIENT_ID;

    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await sha256(rawNonce);

    const redirectUri = AuthSession.makeRedirectUri({
      scheme: "marine-tech",
      path: "oauth-callback",
    });

    const request = new AuthSession.AuthRequest({
      clientId,
      scopes: ["openid", "email", "profile"],
      redirectUri,
      responseType: AuthSession.ResponseType.IdToken,
      extraParams: { nonce: hashedNonce },
    });

    const result = await request.promptAsync(GOOGLE_DISCOVERY);

    if (result.type === "cancel" || result.type === "dismiss") {
      return { ok: "canceled" };
    }
    if (result.type !== "success") {
      const err = (result as { error?: { message?: string } }).error?.message;
      return { ok: false, error: err ?? "Google sign-in failed." };
    }

    const idToken = result.params.id_token;
    if (!idToken) {
      return { ok: false, error: "Google did not return an id_token." };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
      nonce: rawNonce,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (e: unknown) {
    const err = e as { message?: string };
    return { ok: false, error: err.message ?? "Google sign-in failed." };
  }
}
