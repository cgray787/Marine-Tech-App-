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

const supabaseUrl = "https://jwedhavnxqwkczefjifs.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3ZWRoYXZueHF3a2N6ZWZqaWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMjYxMzYsImV4cCI6MjA4OTcwMjEzNn0.Qt6pzzNGd4dnHajss6BF0NhH53Q1SQIQMDj4CiuxGlQ";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
