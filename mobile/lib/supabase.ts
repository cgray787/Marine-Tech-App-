import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

// In-memory fallback for SSR/server environments
const memoryStore: Record<string, string> = {};

const noopStorage = {
  getItem: async (key: string) => memoryStore[key] ?? null,
  setItem: async (key: string, value: string) => { memoryStore[key] = value; },
  removeItem: async (key: string) => { delete memoryStore[key]; },
};

function getStorage() {
  if (Platform.OS !== "web") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SecureStore = require("expo-secure-store");
      return {
        getItem: (key: string) => SecureStore.getItemAsync(key),
        setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
        removeItem: (key: string) => SecureStore.deleteItemAsync(key),
      };
    } catch {
      return noopStorage;
    }
  }
  // Web: use localStorage if available (browser), fallback to memory (SSR)
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    return {
      getItem: async (key: string) => window.localStorage.getItem(key),
      setItem: async (key: string, value: string) => window.localStorage.setItem(key, value),
      removeItem: async (key: string) => window.localStorage.removeItem(key),
    };
  }
  return noopStorage;
}

const supabaseUrl = "https://ikfcnqdrlvhvlyhiuphs.supabase.co";
const supabaseAnonKey = "sb_publishable_y0xjXPDDXb6v-ZObTlmLWg_s93OPBcZ";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
