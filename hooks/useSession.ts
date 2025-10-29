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
          // hvis refresh-token er død → log ud og ryd
          if (String(error.message).toLowerCase().includes("refresh token")) {
            await supabase.auth.signOut();
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

    // auth events (login / logout / token refresh)
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event: AuthEvent, newSession) => {
        if (event === "SIGNED_OUT") {
          safeSetSession(null);
          return;
        }

        // defensivt: hvis refresh fejler og vi ender uden session
        if (event === "TOKEN_REFRESHED" && !newSession) {
          await supabase.auth.signOut();
          safeSetSession(null);
          return;
        }

        safeSetSession(newSession ?? null);
      }
    );

    // web: når tab bliver aktiv igen → sync session fra supabase (localStorage)
    const onVisibility = async () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        const { data } = await supabase.auth.getSession();
        safeSetSession(data?.session ?? null);
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    // native: når app går fra baggrund -> aktiv → sync session igen
    const onAppStateChange = async (nextState: string) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState as any;

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