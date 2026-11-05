import { useState } from "react";
import { useOwnerAuth } from "@/contexts/OwnerAuthContext";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, User, Mail, Lock, CheckCircle2, ArrowRight, Wheat } from "lucide-react";
import emailjs from '@emailjs/browser';

export default function OwnerRegister() {
  const { register } = useOwnerAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // --- EMAIL KÜLDŐ FÜGGVÉNY ---
  const sendWelcomeEmail = async (userName: string, userEmail: string) => {
    const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
    const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
    const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

    // Ellenőrzés: be vannak-e töltve a kulcsok?
    if (!serviceId || !templateId || !publicKey) {
        console.error("HIBA: Hiányoznak az EmailJS .env változók! Ellenőrizd a .env fájlt és indítsd újra a szervert.");
        return;
    }

    console.log("Email küldés indítása...", { to_email: userEmail, to_name: userName });

    try {
        await emailjs.send(
            serviceId,
            templateId,
            {
                // FONTOS: Ezeknek a kulcsoknak (pl. to_email) egyezniük kell az EmailJS beállításokkal!
                to_name: userName,      
                to_email: userEmail,    
                username: userName,     
                app_name: "FarmLog Pro" 
            },
            publicKey
        );
        console.log("✅ Üdvözlő email sikeresen elküldve.");
    } catch (error) {
        console.error("❌ Nem sikerült elküldeni az emailt:", error);
        // Itt nem dobunk hibát a felhasználónak, mert a regisztráció ettől függetlenül sikeres volt.
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !email || !password) {
        toast({ title: "Hiba", description: "Minden mező kitöltése kötelező!", variant: "destructive" });
        return;
    }

    if (password.length < 6) {
        toast({ title: "Hiba", description: "A jelszónak legalább 6 karakternek kell lennie!", variant: "destructive" });
        return;
    }

    setLoading(true);
    try {
      // 1. Firebase regisztráció
      await register({ name, email, password });
      
      // 2. Email küldése (Fire-and-forget: nem várjuk meg, hogy gyors legyen az UI)
      sendWelcomeEmail(name, email);

      setSuccess(true); 
    } catch (err: any) {
      console.error(err);
      let msg = "Nem sikerült a regisztráció.";
      if (err.code === "auth/email-already-in-use") msg = "Ez az email cím már foglalt.";
      if (err.code === "auth/invalid-email") msg = "Érvénytelen email cím formátum.";
      
      toast({ 
          title: "Sikertelen regisztráció", 
          description: msg, 
          variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  // --- SIKERES REGISZTRÁCIÓ NÉZET ---
  if (success) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <Card className="w-full max-w-md bg-slate-900 border-emerald-500/50 shadow-2xl shadow-emerald-900/20 animate-in fade-in zoom-in duration-500">
                <CardContent className="pt-10 flex flex-col items-center text-center space-y-6">
                    <div className="h-20 w-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-2">
                        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                    </div>
                    
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-white">Sikeres regisztráció!</h2>
                        <p className="text-slate-400">
                            Üdvözöljük a <strong className="text-emerald-400">FarmLog Pro</strong> rendszerében, {name}!
                        </p>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-sm text-slate-300 w-full">
                        <p>Fiókod elkészült. Küldtünk egy megerősítő emailt a(z) <span className="text-emerald-400">{email}</span> címre.</p>
                    </div>

                    <Button 
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-6"
                        onClick={() => navigate("/owner/login")}
                    >
                        Tovább a bejelentkezéshez <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                </CardContent>
            </Card>
        </div>
      );
  }

  // --- REGISZTRÁCIÓS ŰRLAP NÉZET ---
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      
      <div className="mb-8 text-center space-y-2">
        <div className="flex items-center justify-center gap-2 mb-2">
            <div className="bg-emerald-600 p-2 rounded-lg">
                <Wheat className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">FarmLog Pro</h1>
        </div>
        <p className="text-slate-400">Telepvezetői Fiók Létrehozása</p>
      </div>

      <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-xl">
        <CardHeader>
          <CardTitle className="text-xl text-white">Regisztráció</CardTitle>
          <CardDescription className="text-slate-400">
            Add meg adataidat a fiók létrehozásához.
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleRegister}>
            <CardContent className="space-y-4">
            
            <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-300">Felhasználónév (Megjelenítendő név)</Label>
                <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <Input 
                        id="name" 
                        placeholder="Pl. Kovács István" 
                        className="pl-9 bg-slate-950 border-slate-700 text-white focus:border-emerald-500 transition-colors"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">Email cím</Label>
                <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <Input 
                        id="email" 
                        type="email" 
                        placeholder="pelda@email.hu" 
                        className="pl-9 bg-slate-950 border-slate-700 text-white focus:border-emerald-500 transition-colors"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">Jelszó</Label>
                <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <Input 
                        id="password" 
                        type="password" 
                        placeholder="••••••••" 
                        className="pl-9 bg-slate-950 border-slate-700 text-white focus:border-emerald-500 transition-colors"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                    />
                </div>
                <p className="text-xs text-slate-500">Legalább 6 karakter hosszú legyen.</p>
            </div>

            </CardContent>

            <CardFooter className="flex flex-col gap-4">
                <Button 
                    type="submit" 
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={loading}
                >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {loading ? "Fiók létrehozása..." : "Regisztráció"}
                </Button>

                <div className="text-center text-sm text-slate-400">
                    Már van fiókod?{" "}
                    <Link to="/owner/login" className="text-emerald-400 hover:underline hover:text-emerald-300">
                        Jelentkezz be itt
                    </Link>
                </div>
            </CardFooter>
        </form>
      </Card>
      
      <div className="mt-8 text-xs text-slate-600">
        &copy; {new Date().getFullYear()} FarmLog Pro. Minden jog fenntartva.
      </div>
    </div>
  );
}
