import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request permissions and get the Expo push token.
 * Returns the token string or null if permissions were denied or unavailable.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not already granted
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permission not granted");
    return null;
  }

  // Android requires a notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#C9A96E",
    });
  }

  // Get the Expo push token — projectId is required for production builds
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId;

  if (!projectId) {
    console.warn(
      "EAS projectId not found — push notifications will not work in production. " +
      "Run 'eas init' from the mobile directory to configure."
    );
    // In development, try without projectId (works in Expo Go)
    try {
      const tokenResponse = await Notifications.getExpoPushTokenAsync();
      return tokenResponse.data;
    } catch (err) {
      console.error("Failed to get push token without projectId:", err);
      return null;
    }
  }

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    return tokenResponse.data;
  } catch (err) {
    console.error("Failed to get push token:", err);
    return null;
  }
}

/**
 * Save the push token to the user's profile in Supabase.
 * The `profiles` table should have a `push_token` text column.
 */
export async function savePushToken(
  userId: string,
  token: string
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ push_token: token })
    .eq("id", userId);

  if (error) {
    console.error("Failed to save push token:", error.message);
  }
}

/**
 * Schedule a local notification (useful for testing or local reminders).
 */
export async function schedulePushNotification(
  title: string,
  body: string
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
    },
    trigger: null, // Fire immediately
  });
}
