import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/lib/auth-context";
import { OfflineProvider } from "@/lib/offline-context";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <AuthProvider>
      <OfflineProvider>
        <>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "#060a12" },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" options={{ gestureEnabled: false }} />
            <Stack.Screen name="register" options={{ gestureEnabled: true, headerShown: false }} />
            <Stack.Screen
              name="job/[id]"
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: "#0c1220" },
                headerTintColor: "#f1f5f9",
                headerTitle: "Job Details",
              }}
            />
            <Stack.Screen
              name="account-settings"
              options={{
                headerShown: false,
                gestureEnabled: true,
              }}
            />
          </Stack>
        </>
      </OfflineProvider>
    </AuthProvider>
  );
}
