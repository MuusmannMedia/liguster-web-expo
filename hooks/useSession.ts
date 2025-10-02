// hooks/useSession.ts
import { Session, User } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "../utils/supabase";

type AuthEvent =
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    let alive = true;

    const safeSetSession = (s: Session | null) => {
      if (alive) setSession(s);
    };

    const loadInitial = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          // Hvis vi lander i en invalideret refresh-token state, så ryd op
          if (String(error.message).toLowerCase().includes("refresh token")) {
            await supabase.auth.signOut(); // nulstil lokal session
            safeSetSession(null);
          } else {
            console.warn("getSession error:", error.message);
          }
        } else {
          safeSetSession(data?.session ?? null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    loadInitial();

    // Lyt til auth-ændringer (login/logout/refresh)
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event: AuthEvent, newSession) => {
        // TOKEN_REFRESHED kan komme med null hvis refresh fejler; ryd i så fald op
        if (event === "SIGNED_OUT") safeSetSession(null);
        else safeSetSession(newSession ?? null);

        // Defensiv oprydning ved fejlende refresh
        if (!newSession && (event as string) === "TOKEN_REFRESHED") {
          await supabase.auth.signOut();
          safeSetSession(null);
        }
      }
    );

    // Foreground refresh (web)
    const onVisibility = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        const { data } = await supabase.auth.getSession();
        safeSetSession(data?.session ?? null);
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    // Foreground refresh (native)
    const onAppStateChange = async (nextState: string) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState as any;
      // Når vi går fra background/inactive -> active
      if (prev.match(/inactive|background/) && nextState === "active") {
        const { data } = await supabase.auth.getSession();
        safeSetSession(data?.session ?? null);
      }
    };
    const appStateSub = AppState.addEventListener("change", onAppStateChange);

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      appStateSub?.remove?.();
    };
  }, []);

  const user: User | null = useMemo(() => session?.user ?? null, [session]);
  const isAuthed = !!user;

  return { session, user, isAuthed, loading };
}