import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useAuth } from "./auth-context";
import {
  registerForPushNotifications,
  savePushToken,
} from "./notifications";

type NotificationContextType = {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
};

const NotificationContext = createContext<NotificationContextType>({
  expoPushToken: null,
  notification: null,
});

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = useAuth();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] =
    useState<Notifications.Notification | null>(null);

  const notificationListener = useRef<Notifications.EventSubscription | null>(
    null
  );
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  // Register for push notifications when user is logged in
  useEffect(() => {
    if (!profile) return;

    registerForPushNotifications().then(async (token) => {
      if (token) {
        setExpoPushToken(token);
        await savePushToken(profile.id, token);
      }
    });
  }, [profile]);

  // Listen for incoming notifications (foreground)
  useEffect(() => {
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        setNotification(notification);
      });

    // Listen for notification taps (background + killed state)
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;

        // Navigate to job detail if the notification contains a job_id
        if (data?.job_id) {
          router.push(`/job/${data.job_id}`);
        }
      });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ expoPushToken, notification }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
