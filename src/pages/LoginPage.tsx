import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useFarm } from "@/contexts/FarmContext";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
// TÖRÖLVE: Nem kell a farmCollection és a Firestore query import, mert nem kereshetünk belépés előtt
// import { farmCollection } from "@/lib/farmDb";
// import { query, where, getDocs } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { AlertCircle, Lock, User, Wrench } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLanguage } from "@/contexts/LanguageContext";

export default function LoginPage() {
  const { user } = useAuth();
  const { clearFarm } = useFarm();
  const { t } = useLanguage();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const nav = useNavigate();
  const location = useLocation() as any;

  useEffect(() => {
    if (user) {
      const to = location?.state?.from?.pathname || "/";
      nav(to, { replace: true });
    }
  }, [user, nav, location]);

  const normalizeUsername = (s: string) => {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, "");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const cleanUsername = normalizeUsername(username);

      // JAVÍTÁS: Adatbázis keresés helyett közvetlen email generálás.
      // Ha a felhasználó beírta a @ jelet, akkor használjuk amit írt,
      // ha nem, akkor hozzáfűzzük a rendszerszintű domaint (@telep.hu).
      let emailToUse = cleanUsername;
      if (!emailToUse.includes("@")) {
        emailToUse = `${cleanUsername}@telep.hu`;
      }

      console.log("Belépési kísérlet ezzel:", emailToUse); // Debug info

      // Közvetlen belépés az Auth-ba
      await signInWithEmailAndPassword(auth, emailToUse, password);

    } catch (err: any) {
      console.error("Login hiba:", err);
      let msg = t("login.error.generic");

      // A hibaüzenetek kezelése maradhat
      if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-email") {
        msg = t("login.error.invalid"); // "Helytelen felhasználónév vagy jelszó"
      } else if (err.code === "auth/too-many-requests") {
        msg = t("login.error.too_many");
      }

      setError(msg);
      setIsLoading(false);
    }
  };

  const handleOwnerSwitch = (e: React.MouseEvent) => {
    e.preventDefault();
    clearFarm();
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black z-0"></div>

      <Card className="w-full max-w-md border-slate-800 bg-slate-900/80 backdrop-blur-xl shadow-2xl relative z-10 text-slate-100 animate-in fade-in zoom-in-95 duration-500">
        <CardHeader className="space-y-1 pb-6 text-center">
          <div className="mx-auto bg-emerald-500/10 p-3 rounded-full w-fit mb-2 border border-emerald-500/20">
            <Lock className="w-6 h-6 text-emerald-500" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-white">{t("login.title")}</CardTitle>
          <CardDescription className="text-slate-400">
            {t("login.subtitle")}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">

            <div className="space-y-2">
              <Label className="text-slate-300">{t("login.username_label")}</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <Input
                  className="pl-9 bg-slate-950/50 border-slate-700 text-white focus:border-emerald-500 focus:ring-emerald-500/20"
                  placeholder={t("login.username_placeholder")}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">{t("login.password_label")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <Input
                  type="password"
                  className="pl-9 bg-slate-950/50 border-slate-700 text-white focus:border-emerald-500 focus:ring-emerald-500/20"
                  placeholder={t("login.password_placeholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive" className="bg-red-500/10 border-red-500/50 text-red-200">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t("common.error")}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-900/20 transition-all"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t("login.btn.loading")}
                </div>
              ) : (
                t("login.btn.submit")
              )}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col items-center gap-4 border-t border-slate-800 pt-4">

          <div className="text-center">
            <p className="text-xs text-slate-500">
              {t("login.footer.no_account")}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Telepvezető vagy?{" "}
              <button
                onClick={handleOwnerSwitch}
                className="text-emerald-400 hover:underline bg-transparent border-none cursor-pointer inline p-0 font-medium"
              >
                Telepvezető belépés (Váltás)
              </button>
            </p>
          </div>

          <div className="w-full border-t border-slate-800 pt-2 flex justify-center text-center px-4">
            <p className="text-[10px] text-slate-600">
              <Wrench className="h-3 w-3 inline mr-1" />
              Új felhasználókat a <strong>Főnök</strong> tud létrehozni belépés után a <em>Beállítások</em> menüben.
            </p>
          </div>

          <p className="text-[10px] text-slate-700 mt-[-5px]">
            v1.0.0 • {t("login.footer.system")}
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
