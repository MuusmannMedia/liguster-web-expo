// hooks/useForeninger.ts
import { useEffect, useState } from "react";
import { Forening } from "../types/forening";
import { supabase } from "../utils/supabase";

/** Henter ALLE foreninger (offentlig liste) */
export function useAlleForeninger(refreshKey?: number) {
  const [data, setData] = useState<Forening[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    supabase
      .from("foreninger")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) console.error("Fejl ved hentning af alle foreninger:", error.message);
        setData((data ?? []) as Forening[]);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  return { data, loading };
}

/** Henter kun foreninger hvor brugeren er medlem
 *  2-trins strategi for at undgå RLS recursion:
 *  1) Hent forening_id fra foreningsmedlemmer (din egen række)
 *  2) Hent foreninger med .in('id', ids)
 */
export function useMineForeninger(userId?: string, refreshKey?: number) {
  const [data, setData] = useState<Forening[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function run() {
      if (!userId) {
        setData([]);
        setLoading(false);
        return;
      }
      setLoading(true);

      // 1) Hent forening_id’er for DENNE bruger (her rammer vi kun egne rækker)
      const { data: memberRows, error: mErr } = await supabase
        .from("foreningsmedlemmer")
        .select("forening_id")
        .eq("user_id", userId);

      if (!isMounted) return;

      if (mErr) {
        console.error("Fejl ved hentning af brugerens medlemsrækker:", mErr.message);
        setData([]);
        setLoading(false);
        return;
      }

      const ids = (memberRows ?? []).map((r: { forening_id: string }) => r.forening_id);
      if (ids.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      // 2) Hent foreninger med .in(...)
      const { data: fRows, error: fErr } = await supabase
        .from("foreninger")
        .select("*")
        .in("id", ids);

      if (!isMounted) return;

      if (fErr) {
        console.error("Fejl ved hentning af brugerens foreninger:", fErr.message);
        setData([]);
      } else {
        setData((fRows ?? []) as Forening[]);
      }
      setLoading(false);
    }

    run();
    return () => {
      isMounted = false;
    };
  }, [userId, refreshKey]);

  return { data, loading };
}