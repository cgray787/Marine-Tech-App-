import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { initDB, getPendingSyncCount } from "./offline-db";
import { syncAll, checkConnectivity, subscribeToConnectivity } from "./sync-service";

type OfflineContextType = {
  isOnline: boolean;
  pendingCount: number;
  lastSyncTime: Date | null;
  syncNow: () => Promise<void>;
  isSyncing: boolean;
};

const OfflineContext = createContext<OfflineContextType>({
  isOnline: true,
  pendingCount: 0,
  lastSyncTime: null,
  syncNow: async () => {},
  isSyncing: false,
});

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const wasOffline = useRef(false);
  const lastSyncAt = useRef(0);

  // Initialize SQLite DB
  useEffect(() => {
    initDB()
      .then(() => setDbReady(true))
      .catch((err) => console.error("[Offline] DB init failed:", err));
  }, []);

  // Refresh pending count
  const refreshPendingCount = useCallback(async () => {
    if (!dbReady) return;
    const count = await getPendingSyncCount();
    setPendingCount(count);
  }, [dbReady]);

  // Sync function — debounced via lastSyncAt cooldown so concurrent triggers
  // (connectivity callback + AppState 'active') can't queue a duplicate run
  // before isSyncing flips.
  const syncNow = useCallback(async () => {
    if (isSyncing || !dbReady) return;
    const now = Date.now();
    if (now - lastSyncAt.current < 2000) return;
    lastSyncAt.current = now;
    setIsSyncing(true);
    try {
      const result = await syncAll();
      setPendingCount(result.remaining);
      if (result.synced > 0) {
        setLastSyncTime(new Date());
      }
    } catch (err) {
      console.error("[Offline] Sync failed:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, dbReady]);

  // Check initial connectivity
  useEffect(() => {
    checkConnectivity().then(setIsOnline);
  }, []);

  // Subscribe to connectivity changes
  useEffect(() => {
    const unsubscribe = subscribeToConnectivity((online) => {
      setIsOnline(online);

      // Auto-sync when coming back online
      if (online && wasOffline.current) {
        wasOffline.current = false;
        syncNow();
      }
      if (!online) {
        wasOffline.current = true;
      }
    });

    return unsubscribe;
  }, [syncNow]);

  // Refresh pending count on app foreground and when DB is ready
  useEffect(() => {
    if (!dbReady) return;
    refreshPendingCount();

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        refreshPendingCount();
        // Also try syncing when app comes to foreground
        checkConnectivity().then((online) => {
          if (online) syncNow();
        });
      }
    };

    const subscription = AppState.addEventListener("change", handleAppState);
    return () => subscription.remove();
  }, [dbReady, refreshPendingCount, syncNow]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        pendingCount,
        lastSyncTime,
        syncNow,
        isSyncing,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export const useOffline = () => useContext(OfflineContext);
