import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Home() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Felső sáv – brand + user info */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          
          {/* Bal oldal: alkalmazás brand blokk */}
          <div className="flex items-center gap-3">
            {/* Ikon / monogram */}
            <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm">
              <span className="text-sm font-bold text-white tracking-tight">
                FP
              </span>
            </div>

            {/* Név + cég + „suite” jelleg */}
            <div className="flex flex-col leading-tight">
              <span className="text-[11px] uppercase tracking-[0.16em] text-emerald-700">
                Farm management suite
              </span>
              <span className="text-lg font-bold text-slate-900">
                FarmLog Pro
              </span>
              <span className="text-[11px] text-slate-500">
                by <span className="font-medium">TelepTech Kft.</span>
              </span>
            </div>
          </div>

          {/* Jobb oldal: bejelentkezett felhasználó + kilépés */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 text-right">
              {t("app.logged_in")}{" "}
              <b>{user?.displayName || (user as any)?.username}</b>{" "}
              {user?.role && (
                <i className="text-xs text-slate-500">({(user as any)?.role})</i>
              )}
            </span>
            <button
              onClick={logout}
              className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              {t("app.logout")}
            </button>
          </div>
        </div>
      </header>

      {/* Fő tartalom */}
      <main className="max-w-5xl mx-auto p-4">
        <div className="rounded-xl bg-white shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold mb-2">
            {t("home.welcome_title")}
          </h2>
          <p className="mb-4 text-sm text-slate-700">
            {t("home.welcome_text")}
          </p>

          {/* Rövid leírás, mint „about” szekció */}
          <div className="mt-4 rounded-lg bg-slate-50 border border-slate-100 p-4 text-sm text-slate-600">
            <p className="font-medium mb-1">FarmLog Pro</p>
            <p className="mb-1">
              Digitális telepi napló és menedzsment rendszer baromfi telepekhez:
              betelepítések, napi mérlegelések, műszakbeosztás és elhulláskezelés
              egy közös felületen.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Forgalmazó: <span className="font-medium">TelepTech Kft.</span>
            </p>
          </div>

          {/* „Pro app” jellegű lábléc infó */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>© {year} TelepTech Kft. • FarmLog Pro</span>
            <span>Version 1.0.0</span>
          </div>
        </div>
      </main>
    </div>
  );
}
