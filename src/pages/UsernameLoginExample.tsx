// src/pages/UsernameLoginExample.tsx
import React, { useState } from "react";
import { createAccountWithUsername, signInWithUsername } from "@/services/auth/usernameAuth";
import { useLanguage } from "@/contexts/LanguageContext"; // <--- ÚJ IMPORT

export default function UsernameLoginExample() {
  const { t } = useLanguage(); // <--- NYELVI HOOK
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login"|"register">("login");
  const [status, setStatus] = useState<string>("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(t("userex.status_processing"));
    try {
      if (mode === "register") {
        await createAccountWithUsername(username, password);
        setStatus(t("userex.status_reg_success"));
      } else {
        await signInWithUsername(username, password);
        setStatus(t("userex.status_login_success"));
      }
    } catch (err: any) {
      // A hibaüzenetek gyakran technikai jellegűek, de megpróbálhatjuk lefordítani,
      // ha a login oldalon használtunk hasonlókat (pl. t("login.error.invalid")).
      setStatus(err?.message || String(err));
    }
  }

  return (
    <div style={{maxWidth:420, margin:"40px auto", padding:16}}>
      <h2>{t("userex.title")}</h2>
      <div style={{display:"flex", gap:8, marginBottom:12}}>
        <button onClick={()=>setMode("login")} disabled={mode==="login"}>
            {t("userex.mode_login")}
        </button>
        <button onClick={()=>setMode("register")} disabled={mode==="register"}>
            {t("userex.mode_register")}
        </button>
      </div>

      <form onSubmit={onSubmit}>
        <div style={{display:"grid", gap:8}}>
          <input 
            placeholder={t("login.username_placeholder")} // Újrahasznosítva a Login oldalról
            value={username} 
            onChange={e=>setUsername(e.target.value)} 
          />
          <input 
            placeholder={t("login.password_placeholder")} // Újrahasznosítva a Login oldalról
            type="password" 
            value={password} 
            onChange={e=>setPassword(e.target.value)} 
          />
          <button type="submit">
            {mode==="register" ? t("userex.btn_register") : t("userex.btn_login")}
          </button>
        </div>
      </form>
      <p style={{marginTop:12}}>{status}</p>
      <p style={{fontSize:12, opacity:.8, marginTop:8}}>
        {t("userex.footer_demo")}
      </p>
    </div>
  );
}
