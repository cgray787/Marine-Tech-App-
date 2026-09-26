import * as Updates from "expo-updates";

/**
 * Apply a waiting over-the-air update on THIS launch instead of the next one.
 *
 * expo-updates' default downloads a new bundle in the background and only
 * switches to it on the following cold start. In practice that meant a fix
 * published to EAS sat unused: EAS insights showed 0 launches on every recent
 * update, and "open the app, the bug is still there" read as the fix not
 * working. A backgrounded app coming forward does not count as a launch.
 *
 * This runs while the splash screen is still up, before any screen has
 * rendered, so reloading here can never discard a half-filled form.
 *
 * Every step is time-boxed. Techs open this app in marina dead-spots; a slow or
 * absent network must never hold them on the splash screen. On any failure we
 * fall through to the normal launch and expo-updates' default behaviour.
 */
const CHECK_TIMEOUT_MS = 4_000;
const FETCH_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function applyUpdateOnLaunch(): Promise<void> {
  // Dev client / Expo Go serve JS from Metro; there is nothing to apply.
  if (__DEV__ || !Updates.isEnabled) return;

  try {
    const check = await withTimeout(Updates.checkForUpdateAsync(), CHECK_TIMEOUT_MS, "update check");
    if (!check.isAvailable) return;

    const fetched = await withTimeout(Updates.fetchUpdateAsync(), FETCH_TIMEOUT_MS, "update download");
    if (fetched.isNew) await Updates.reloadAsync();
  } catch (error) {
    // Not swallowed silently: offline or slow is expected, but it should still
    // be visible in device logs if updates keep failing to apply.
    console.warn("[updates] launch-time update skipped:", error);
  }
}
