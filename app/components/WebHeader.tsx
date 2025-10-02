// app/components/WebHeader.tsx
import { Link, router } from "expo-router";
import React, { useEffect, useState } from "react";

import { useSession } from "../../hooks/useSession";
import { supabase } from "../../utils/supabase";

const MOBILE_MAX = 719;

export default function WebHeader() {
  const { session, loading } = useSession();
  const isAuthed = !!session;

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const goHome = () => router.push(isAuthed ? "/(protected)/Nabolag" : "/");
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/LoginScreen");
    }
  };

  return (
    <header className="liguster-header">
      <div className="brand" onClick={goHome} role="button" aria-label="Liguster">
        <img
          src="/Liguster-logo-website-clean.png"
          alt="LIGUSTER"
          height={28}
          style={{ display: "block" }}
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement;
            if (!el.dataset.fallbackTried) {
              el.dataset.fallbackTried = "1";
              el.src = "/liguster-logo-website-clean.png";
            }
          }}
        />
      </div>

      {!isMobile ? (
        // DESKTOP: links
        <nav className="nav-links" aria-label="Hovedmenu">
          {!loading &&
            (isAuthed ? (
              <>
                <Link href="/(protected)/Nabolag" className="nav-link">Nabolag</Link>
                <Link href="/(protected)/ForeningerScreen" className="nav-link">Forening</Link>
                <Link href="/(protected)/Beskeder" className="nav-link">Beskeder</Link>
                <Link href="/(protected)/MineOpslag" className="nav-link">Mine Opslag</Link>
                <Link href="/(protected)/MigScreen" className="nav-link">Mig</Link>
                <button className="btn-logout" onClick={signOut}>
                  <span className="btn-logout-txt">Log ud</span>
                </button>
              </>
            ) : (
              <button className="btn" onClick={() => router.push("/LoginScreen")}>
                <span style={{ fontWeight: 700 }}>Log ind</span>
              </button>
            ))}
        </nav>
      ) : (
        // MOBIL: burger
        <MobileMenu loading={loading} isAuthed={isAuthed} signOut={signOut} />
      )}

      <style>{`
        .liguster-header{
          height:64px; background:#0b1220; border-bottom:1px solid #1e293b;
          padding:0 16px; display:flex; align-items:center; justify-content:space-between; position:relative; z-index:100;
        }
        .brand{ height:28px; display:flex; align-items:center; cursor:pointer; }
        .nav-links{ display:flex; align-items:center; gap:18px; }
        .nav-link{ color:#e2e8f0; text-decoration:none; font-size:14px; opacity:.9 }
        .nav-link:hover{ opacity:1 }
        .btn{
          padding:8px 12px; border:1px solid #334155; border-radius:10px;
          background:#0f172a; color:#e2e8f0; cursor:pointer
        }
        /* LOG UD: tydelig hvid tekst og hvid kant */
        .btn-logout{
          padding:8px 12px; border:1px solid #fff; border-radius:10px;
          background:transparent; cursor:pointer
        }
        .btn-logout-txt{ color:#fff; font-weight:700 }
        .btn-logout:hover{ background:#fff; }
        .btn-logout:hover .btn-logout-txt{ color:#0b1220; }
      `}</style>
    </header>
  );
}

function MobileMenu({
  loading,
  isAuthed,
  signOut,
}: {
  loading: boolean;
  isAuthed: boolean;
  signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        className="burger"
        aria-label={open ? "Luk menu" : "Åbn menu"}
        onClick={() => setOpen((v) => !v)}
      >
        ☰
      </button>

      {open && (
        <div className="mobile-menu" role="menu">
          {!loading &&
            (isAuthed ? (
              <>
                <Link href="/(protected)/Nabolag" className="menu-item" onClick={() => setOpen(false)}>Nabolag</Link>
                <Link href="/(protected)/ForeningerScreen" className="menu-item" onClick={() => setOpen(false)}>Forening</Link>
                <Link href="/(protected)/Beskeder" className="menu-item" onClick={() => setOpen(false)}>Beskeder</Link>
                <Link href="/(protected)/MineOpslag" className="menu-item" onClick={() => setOpen(false)}>Mine Opslag</Link>
                <Link href="/(protected)/MigScreen" className="menu-item" onClick={() => setOpen(false)}>Mig</Link>
                <button className="menu-cta" onClick={() => { setOpen(false); signOut(); }}>Log ud</button>
              </>
            ) : (
              <button className="menu-cta" onClick={() => { setOpen(false); router.push("/LoginScreen"); }}>
                Log ind
              </button>
            ))}
        </div>
      )}

      <style>{`
        .burger{
          border:1px solid #334155; border-radius:10px; padding:6px 10px;
          background:#0f172a; color:#e2e8f0; font-weight:900; font-size:16px; cursor:pointer
        }
        .mobile-menu{
          position:absolute; right:0; top:52px; min-width:220px; background:#0b1220; border:1px solid #1e293b;
          border-radius:12px; padding:8px; box-shadow:0 8px 20px rgba(0,0,0,.35); z-index:999;
        }
        .menu-item{
          display:block; padding:10px 12px; color:#e2e8f0; text-decoration:none; font-size:14px
        }
        .menu-item:hover{ background:#0f172a }
        .menu-cta{
          margin-top:6px; width:100%; padding:10px 12px; border-radius:10px;
          background:#fff; color:#0b1220; font-weight:900; border:0; cursor:pointer
        }
      `}</style>
    </div>
  );
}