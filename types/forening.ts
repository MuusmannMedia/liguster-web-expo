// types/forening.ts

/* --------- Eksisterende typer (uændret) --------- */
export type Forening = {
  id: string;
  navn: string;
  sted: string;
  beskrivelse: string;
  billede_url?: string | null;
  oprettet_af: string;
  created_at: string;
};

export type Foreningsmedlem = {
  id: string;
  forening_id: string;
  user_id: string;
  rolle: "admin" | "medlem" | "administrator" | string;
  status: "pending" | "approved" | "declined";
  created_at: string;

  // Når vi henter med join:
  foreninger?: Forening | null;
  users?: {
    name?: string | null;
    username?: string | null;
    email?: string | null;
    avatar_url?: string | null; // kan være sti eller fuld URL
  } | null;
};

/* --------- Nye, små hjælpe-typer (bruges af chat/komponenter) --------- */
// Et letvægts-user-objekt til visning af navn/billede i beskeder
export type BrugerLite = {
  id: string;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  avatar_url?: string | null;
};

// “MedlemsRow” som komponenterne bruger: kun de felter vi behøver
export type MedlemsRow = Pick<Foreningsmedlem, "user_id" | "rolle" | "status"> & {
  users?: BrugerLite | null;
};

/* --------- Tråde (samtaler) --------- */
export type ThreadRow = {
  id: string;
  forening_id: string;
  title: string;
  created_by: string;
  created_at: string;
};

/* --------- Beskeder --------- */
export type MessageRow = {
  id: string;
  thread_id: string;
  user_id: string;
  text: string;
  created_at: string;
};