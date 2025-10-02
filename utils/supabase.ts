// utils/supabase.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

const isWeb = typeof window !== "undefined" && typeof document !== "undefined";

const SUPABASE_URL = "https://gizskyfynvyvhnaqcyax.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpenNreWZ5bnZ5dmhuYXFjeWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NjQ2ODUsImV4cCI6MjA2NjQ0MDY4NX0.4CpLeX9NFoZLEbfwXkGSTOFwH7drrG7SeEHW51Ic_Bg";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: isWeb,          // Kun web fanger session i URL
    storage: isWeb ? undefined : AsyncStorage, // Brug AsyncStorage på native
    storageKey: "liguster-auth",
  },
});