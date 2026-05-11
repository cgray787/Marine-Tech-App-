# Apple + Google Sign-In setup (v1.1)

Code-side is done on branch `feat/sso-apple-google`. To actually make the
buttons work, three external consoles need configuration. Do these before
shipping the branch to production.

## 1. Apple Developer Portal

1. Sign in: https://developer.apple.com/account → Certificates, IDs & Profiles
2. **Identifiers → App IDs → `com.grayyachts.marinetech`** → enable
   **Sign In with Apple** capability → Save
3. **Identifiers → Services IDs** → register a new Services ID:
   - Description: `Marine Tech Web Sign In with Apple`
   - Identifier: `com.grayyachts.marinetech.signin`
   - Enable **Sign In with Apple** → Configure:
     - Primary App ID: `com.grayyachts.marinetech`
     - Domains: `ikfcnqdrlvhvlyhiuphs.supabase.co`
     - Return URLs: `https://ikfcnqdrlvhvlyhiuphs.supabase.co/auth/v1/callback`
4. **Keys → +** → create a key:
   - Name: `Marine Tech Sign In with Apple Key`
   - Enable **Sign In with Apple** → Configure → Primary App ID: above
   - Continue → Register → **Download** the .p8 file (one-shot download, save it)
   - Note the **Key ID** (10-char string) shown on the key page
5. Note your **Team ID** (top-right corner of the portal, 10-char string)

## 2. Google Cloud Console

1. Sign in: https://console.cloud.google.com/ → create a project (e.g.
   `marine-tech-prod`) if you don't have one
2. **APIs & Services → OAuth consent screen** → External → fill in:
   - App name: `Marine Tech`
   - User support email + developer contact email: yours
   - App logo (optional): the gold anchor icon
   - Authorized domains: `supabase.co`
   - Save
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Type: **iOS** → Name: `Marine Tech iOS` → Bundle ID:
     `com.grayyachts.marinetech` → Create
   - Note the **iOS client ID** (ends with `.apps.googleusercontent.com`)
4. Create a second OAuth client:
   - Type: **Web application** → Name: `Marine Tech Web (Supabase)`
   - Authorized redirect URIs:
     `https://ikfcnqdrlvhvlyhiuphs.supabase.co/auth/v1/callback`
   - Create. Note the **Web client ID** and **client secret**.

## 3. Supabase Dashboard

https://supabase.com/dashboard/project/ikfcnqdrlvhvlyhiuphs/auth/providers

### Apple provider
- Toggle **Enable Apple provider** ON
- **Services ID**: `com.grayyachts.marinetech.signin`
- **Secret Key (for OAuth)**: paste contents of the .p8 file from step 1.4
- **Key ID**: from step 1.4
- **Team ID**: from step 1.5
- Save

### Google provider
- Toggle **Enable Google provider** ON
- **Authorized Client IDs**: paste the iOS client ID from step 2.3
  (this is the "for Sign in with Google on iOS" field)
- **Client ID (for OAuth)**: paste the Web client ID from step 2.4
- **Client Secret (for OAuth)**: paste the Web client secret from step 2.4
- Save

## 4. App env vars (build-time)

The Google iOS client ID must be embedded in the build so the native
prompt knows which Google client to talk to. Add to `mobile/.env.local`
(gitignored) AND to EAS secrets so production builds pick it up:

```
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<ios-client-id>.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
```

EAS:
```
cd mobile
npx eas-cli env:create production EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
npx eas-cli env:create production EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
```

## 5. Smoke test, then ship

After all the above:
1. Bump iOS buildNumber in `mobile/app.json`
2. `cd mobile && npx eas-cli build --platform ios --profile production`
3. TestFlight → install → tap **Sign in with Apple** → should land in app
4. Tap **Continue with Google** → pick a Google account → should land in app
5. Once both work end-to-end, submit to App Review with a clear note in the
   reply that v1.1 adds SSO per Apple Guideline 4.8 (Apple Sign In present
   alongside Google with equal prominence).
