import React from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext"; // <--- ÚJ IMPORT

/** 
 * Lebegő alsó-bal sarok "Bejelentkezve" jelzés + Kijelentkezés gomb.
 * Nem bolygatja az elrendezést, csak ráúszik a képernyőre.
 * Login/seed/hash oldalakon automatikusan elrejtjük.
 */
export default function AuthStatusFloating() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const { t } = useLanguage(); // <--- NYELVI HOOK

  const hiddenOn = ["/login", "/seed-users", "/hash"];
  if (!user) return null;
  if (hiddenOn.some(p => pathname.startsWith(p))) return null;

  // Biztonsági fallback: ha nincs role, akkor "dolgozó"
  const userRole = (user as any).role || "dolgozó";

  return (
    <div className="fixed left-3 bottom-3 z-[9999] pointer-events-none">
      <div className="pointer-events-auto select-none rounded-xl bg-black/70 text-white shadow-xl backdrop-blur px-3 py-2 border border-white/10">
        <div className="flex items-center gap-3">
          <div className="text-xs leading-tight">
            <div>
              <span className="opacity-80">{t("menu.logged_in")} </span> 
              <b>{user.displayName || user.username}</b>
            </div>
            <div className="opacity-80">
              {/* Dinamikus fordítás: role.admin / role.főnök / role.dolgozó */}
              {t("menu.role")}: <i>{t(`role.${userRole}`)}</i>
            </div>
          </div>
          <button
            onClick={logout}
            className="text-xs rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 px-2 py-1 border border-white/10"
            title={t("menu.logout")}
          >
            {t("menu.logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
