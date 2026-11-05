// src/components/AppBrand.tsx
import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export function AppBrand() {
  const { t } = useLanguage();

  return (
    <div className="flex items-center gap-3">
      {/* Kis logó / monogram kocka */}
      <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm">
        <span className="text-sm font-bold text-white tracking-tight">
          FP
        </span>
      </div>

      {/* Név + rendszer + cég */}
      <div className="flex flex-col leading-tight">
        {/* IDE KERÜL A login.footer.system  */}
        <span className="text-[11px] uppercase tracking-[0.16em] text-emerald-700">
           FarmLog Pro
        </span>

        {/* Fő terméknév */}
        <span className="text-lg font-bold text-slate-900">
         
           {t("login.footer.system")}
        </span>

        {/* Cég */}
        <span className="text-[11px] text-slate-500">
          by <span className="font-medium">TelepTech Kft.</span>
        </span>
      </div>
    </div>
  );
}
