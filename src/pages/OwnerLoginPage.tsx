import React, { useState, useEffect } from "react";
import { useOwnerAuth } from "@/contexts/OwnerAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Mail, Lock } from "lucide-react";
import { Link, useNavigate } from "react-router-dom"; // <--- useNavigate importálása

export default function OwnerLoginPage() {
  const { user, login, logout } = useOwnerAuth();
  const navigate = useNavigate(); // <--- Hook inicializálása
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // --- EZ A RÉSZ HIÁNYZOTT ---
  // Ha a felhasználó be van lépve, azonnal átirányítjuk a Telepkezelőbe
  useEffect(() => {
    if (user) {
      navigate("/owner/farms");
    }
  }, [user, navigate]);
  // ---------------------------

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login(email, password);
      // A useEffect fogja kezelni az átirányítást, amint a 'user' state frissül
    } catch (err: any) {
      console.error("[OwnerLogin] hiba:", err);
      let msg = "Sikertelen belépés. Ellenőrizd az emailt és jelszót.";
      if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
        msg = "Hibás email vagy jelszó.";
      } else if (err.code === "auth/wrong-password") {
        msg = "Hibás jelszó.";
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <Card className="w-full max-w-md bg-slate-900 border-slate-800 text-slate-50">
        <CardHeader>
          <CardTitle className="text-lg">Telepvezető belépés</CardTitle>
          <CardDescription className="text-slate-400">
            Kezeld telepeidet és előfizetéseidet egy helyen.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4 bg-red-900/20 border-red-900">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Hiba</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="owner-email">Email cím</Label>
              <div className="relative">
                <Mail className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  id="owner-email"
                  type="email"
                  autoComplete="email"
                  className="pl-8 bg-slate-900 border-slate-700"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="owner-password">Jelszó</Label>
              <div className="relative">
                <Lock className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  id="owner-password"
                  type="password"
                  autoComplete="current-password"
                  className="pl-8 bg-slate-900 border-slate-700"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700" disabled={isLoading}>
              {isLoading ? "Belépés..." : "Belépés"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col items-center gap-2 text-xs text-slate-400 pt-0">
          <div>
            Még nincs fiókod?{" "}
            <Link to="/owner/register" className="text-emerald-400 hover:underline">
              Regisztráció
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
