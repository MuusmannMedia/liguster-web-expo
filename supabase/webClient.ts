// supabase/webClient.ts
import { createClient } from "@supabase/supabase-js";

// NB: brug dine rigtige env keys / URL som du bruger i appen.
// Hvis de ligger i .env eller i utils, så genbrug samme værdier her.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://gizskyfynvyvhnaqcyax.supabase.co";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpenNreWZ5bnZ5dmhuYXFjeWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NjQ2ODUsImV4cCI6MjA2NjQ0MDY4NX0.4CpLeX9NFoZLEbfwXkGSTOFwH7drrG7SeEHW51Ic_Bg";

// På web kan vi bare bruge supabase-js direkte med localStorage fallback,
// uden react-native AsyncStorage.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});