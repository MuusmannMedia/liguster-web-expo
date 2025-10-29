// hooks/useHydrationGate.ts
import React, { createContext, useCallback, useContext, useRef } from "react";
import { InteractionManager } from "react-native";

type Ctx = {
  runAppHydrationOnce: (fn: () => Promise<any>) => Promise<void>;
};

const HydrationCtx = createContext<Ctx | undefined>(undefined);

/** Brug denne til at wrappe hele appen (fx i app/_layout.tsx). */
export function HydrationProvider({ children }: { children: React.ReactNode }) {
  const didHydrateRef = useRef(false);

  const runAppHydrationOnce = useCallback(async (fn: () => Promise<any>) => {
    if (didHydrateRef.current) return;
    didHydrateRef.current = true;

    // Vent til UI-interaktioner er færdige
    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => resolve());
    });

    // Mikro-yield (hjælper Hermes/bridge)
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    await fn();
  }, []);

  // Ingen JSX, så .ts kompilerer fint
  return React.createElement(
    HydrationCtx.Provider,
    { value: { runAppHydrationOnce } },
    children
  );
}

/** Hook – med fallback hvis Provider ikke er monteret. */
export function useHydrationGate(): Ctx {
  const ctx = useContext(HydrationCtx);
  if (!ctx) {
    return {
      runAppHydrationOnce: async (fn) => {
        await fn(); // fallback: kør straks
      },
    };
  }
  return ctx;
}