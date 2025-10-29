// utils/supabase.ts
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-url-polyfill/auto";

// Din eksisterende URL / anon key:
const SUPABASE_URL = "https://gizskyfynvyvhnaqcyax.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpenNreWZ5bnZ5dmhuYXFjeWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NjQ2ODUsImV4cCI6MjA2NjQ0MDY4NX0.4CpLeX9NFoZLEbfwXkGSTOFwH7drrG7SeEHW51Ic_Bg";

// Helper: vend en "storage" implementation der ikke eksploderer i web-build
function makeStorage() {
  const hasWindow =
    typeof window !== "undefined" && typeof window.localStorage !== "undefined";

  // WEB (browser) → brug localStorage
  if (hasWindow) {
    return {
      getItem: async (key: string) => {
        return window.localStorage.getItem(key);
      },
      setItem: async (key: string, value: string) => {
        window.localStorage.setItem(key, value);
      },
      removeItem: async (key: string) => {
        window.localStorage.removeItem(key);
      },
    };
  }

  // NATIVE (iOS/Android dev) → brug AsyncStorage
  // Bemærk: i Expo web "preload"-fasen findes hverken window eller real native env,
  // så vi må IKKE kalde AsyncStorage direkte dér, fordi det forventer en RN runtime.
  // Vi laver derfor et lille in-memory fallback, som bliver brugt i den fase.
  const isReactNativeRuntime =
    typeof navigator !== "undefined" &&
    // @ts-ignore navigator.product kan være "ReactNative"
    navigator.product === "ReactNative";

  if (isReactNativeRuntime) {
    // normal mobil-app-adfærd
    return {
      getItem: (key: string) => AsyncStorage.getItem(key),
      setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
      removeItem: (key: string) => AsyncStorage.removeItem(key),
    };
  }

  // Fallback (SSR-ish / Metro bundler init for web): in-memory map
  const memoryStore: Record<string, string | null> = {};
  return {
    getItem: async (key: string) => {
      return memoryStore[key] ?? null;
    },
    setItem: async (key: string, value: string) => {
      memoryStore[key] = value;
    },
    removeItem: async (key: string) => {
      delete memoryStore[key];
    },
  };
}

// bygg én shared client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // På web skal Supabase selv kunne læse session fra redirect-URL (fx magic link)
    detectSessionInUrl:
      typeof window !== "undefined" && typeof document !== "undefined",
    // VIGTIGT: vores egen storage der virker både i web/dev og native
    storage: makeStorage(),
    storageKey: "liguster-auth",
  },
});