import React, { useState } from "react";
import { sha256Hex } from "@/utils/hash";
import { useLanguage } from "@/contexts/LanguageContext"; // <--- IMPORT

export default function HashTool() {
  const [pwd, setPwd] = useState("");
  const [hash, setHash] = useState<string>("");
  const { t } = useLanguage(); // <--- HOOK HASZNÁLATA

  const doHash = async () => {
    setHash(await sha256Hex(pwd));
  };

  return (
    <div className="min-h-screen grid place-items-center bg-slate-900 text-white p-6">
      <div className="w-full max-w-xl bg-white/10 border border-white/10 rounded-2xl p-6">
        <h2 className="text-xl font-semibold mb-2">{t("hashtool.title")}</h2>
        <p className="text-slate-300 mb-4 text-sm">
          {t("hashtool.desc")}
        </p>
        <div className="space-y-3">
          <input
            placeholder={t("hashtool.placeholder")}
            type="text"
            className="w-full rounded-lg bg-white/5 border border-white/20 px-3 py-2 outline-none"
            value={pwd}
            onChange={e => setPwd(e.target.value)}
          />
          <button onClick={doHash} className="rounded-lg bg-emerald-500 hover:bg-emerald-600 px-4 py-2">
            {t("hashtool.btn")}
          </button>
          {hash && (
            <div className="mt-3 break-all text-xs bg-black/30 rounded-lg p-3 border border-white/10">
              {hash}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
