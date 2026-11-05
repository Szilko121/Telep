"use client";

import React from "react";
import { Outlet, NavLink } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext"; // <--- ÚJ IMPORT

export default function AuthShell() {
  const { user, logout } = useAuth();
  const { t } = useLanguage(); // <--- NYELVI HOOK

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Fejléc */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-bold">{t("app.title")}</h1>
            
            {/* (OPCIÓ) Gyors nav */}
            <nav className="hidden md:flex items-center gap-3 text-sm text-slate-600">
              <NavLink
                to="/" // Általában ez a Dashboard route-ja
                className={({ isActive }) =>
                  `px-2 py-1 rounded ${isActive ? "bg-slate-100 font-medium" : "hover:bg-slate-50"}`
                }
              >
                {t("dashboard.title")}
              </NavLink>
              <NavLink
                to="/napilap" // Route ellenőrzése az App.tsx szerint
                className={({ isActive }) =>
                  `px-2 py-1 rounded ${isActive ? "bg-slate-100 font-medium" : "hover:bg-slate-50"}`
                }
              >
                {t("dashboard.qa.daily")}
              </NavLink>
              {/* További menüpontok szükség esetén */}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              {t("app.logged_in")} <b>{user?.displayName || user?.username}</b>{" "}
              <i>({user?.role})</i>
            </span>
            <button
              onClick={logout}
              className="rounded-md bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-800 transition-colors"
            >
              {t("app.logout")}
            </button>
          </div>
        </div>
      </header>

      {/* Tartalom */}
      <main className="max-w-6xl mx-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}
