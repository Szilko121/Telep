import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { navigationConfig } from "@/config/navigation";
import { getPermissions, savePermissions, PermissionsMatrix } from "@/services/permissionsService";
import { Shield, Save, Loader2, HelpCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

// --- JOGOSULTSÁG MAGYARÁZATOK (IGAZÍTVA A NAVIGATION.TS-HEZ) ---
const permissionDescriptions: Record<string, { title: string; desc: string; impact: string }> = {
    // ================= FŐOLDALAK =================
    "/": {
        title: "Vezérlőpult (Dashboard)",
        desc: "A rendszer nyitóoldala az összesített státuszokkal.",
        impact: "A felhasználó belépéskor üres oldalt lát."
    },
    "/napilap": {
        title: "Napi Napló",
        desc: "A napi termelési adatok (elhullás, takarmány, víz) rögzítése.",
        impact: "Nem lehet rögzíteni a napi adatokat."
    },
    "/felugyelet": {
        title: "Telep Felügyelet",
        desc: "IoT eszközök, szenzorok és silók központi felügyelete.",
        impact: "A felhasználó nem fér hozzá a szenzoros adatokhoz."
    },
    "/merlegeles": {
        title: "Mérlegelés",
        desc: "Testtömeg mérések kezelése és FCR számítás.",
        impact: "Nem követhető nyomon az állomány súlygyarapodása."
    },
    "/elhulasok": {
        title: "Elhullások",
        desc: "Részletes statisztikák az elhullási adatokról.",
        impact: "A felhasználó nem látja a veszteségi elemzéseket."
    },
    "/vitamin-terv": {
        title: "Vitamin Terv",
        desc: "Gyógyszerezési naptár és vitamin adagolási terv.",
        impact: "A dolgozó nem látja, mit kell beadni az állománynak."
    },
    "/munkak": {
        title: "Munkák",
        desc: "Karbantartási feladatok és munkaórák kezelése.",
        impact: "Nem lehet munkaidőt rögzíteni."
    },
    "/uzenetek": {
        title: "Üzenetek",
        desc: "Belső értesítési központ.",
        impact: "A felhasználó nem kapja meg a belső üzeneteket."
    },
    "/olak": {
        title: "Ólak",
        desc: "Istállók listája és alapbeállításai.",
        impact: "Nem lehet megtekinteni az istállók listáját."
    },
    "/istallo-terkep": {
        title: "Istálló Térkép",
        desc: "Grafikus, vizuális nézet az istállók elhelyezkedéséről.",
        impact: "Nem érhető el a térképes nézet."
    },
    "/istallo-szerkeszto": {
        title: "Istálló Szerkesztő",
        desc: "3D tervezőeszköz az alaprajz módosítására.",
        impact: "Nem lehet módosítani az épületek alaprajzát."
    },
    "/muszakbeosztas": {
        title: "Műszakbeosztás",
        desc: "Dolgozói naptár, műszakok tervezése.",
        impact: "A felhasználó nem látja a beosztását."
    },
    "/turnus": {
        title: "Turnus Kezelés",
        desc: "Aktív turnus adatai és archívum.",
        impact: "Nem érhetők el a korábbi turnusok."
    },
    "/betelepites": {
        title: "Betelepítés",
        desc: "Új állomány indítása.",
        impact: "Nem lehet új turnust indítani."
    },
    "/settings": {
        title: "Beállítások",
        desc: "Rendszerszintű beállítások.",
        impact: "A felhasználó nem tudja testreszabni a felületet."
    },

    // ================= AL-FUNKCIÓK (ACTIONS) =================

    // --- TELEP FELÜGYELET ---
    "/felugyelet#overview": {
        title: "Áttekintés",
        desc: "A legfontosabb szenzoradatok kártyás nézete.",
        impact: "Eltűnik az 'Áttekintés' fül."
    },
    "/felugyelet#opticon": {
        title: "Klíma (Opticon)",
        desc: "Részletes szellőzés és hőmérséklet adatok.",
        impact: "Nem láthatók a klímavezérlő részletes adatai."
    },
    "/felugyelet#rainbow": {
        title: "Etetés (Rainbow)",
        desc: "Silók részletes töltöttsége és fogyasztás.",
        impact: "Nem láthatók a takarmányfogyasztási részletek."
    },

    // --- MÉRLEGELÉS ---
    "/merlegeles#new_measurement": {
        title: "Új Mérés Rögzítése",
        desc: "Kézi mérlegelési adatok beviteli mezői.",
        impact: "Csak olvasási jog marad, nem lehet rögzíteni."
    },
    "/merlegeles#pdf_export": {
        title: "PDF Letöltés",
        desc: "Mérlegelési napló exportálása PDF-be.",
        impact: "Eltűnik a PDF gomb."
    },
    "/merlegeles#csv_export": {
        title: "CSV Letöltés",
        desc: "Adatok exportálása Excel/CSV formátumban.",
        impact: "Eltűnik a CSV gomb."
    },
    "/merlegeles#archive": {
        title: "Archívum",
        desc: "Régi mérések megtekintése.",
        impact: "Nem lehet visszanézni a lezárt turnusok adatait."
    },
    "/merlegeles#import": {
        title: "Importálás",
        desc: "Tömeges adatfeltöltés fájlból.",
        impact: "Eltűnik az Importálás gomb."
    },

    // --- ELHULLÁSOK ---
    "/elhulasok#pdf_export": {
        title: "PDF Letöltés",
        desc: "Az elhullási táblázat nyomtatása.",
        impact: "Nem lehet kiexportálni a listát."
    },

    // --- VITAMIN TERV ---
    "/vitamin-terv#edit": {
        title: "Szerkesztés",
        desc: "A naptár módosítása, vitaminok hozzáadása.",
        impact: "Csak nézheti a tervet, nem módosíthatja."
    },
    "/vitamin-terv#print": {
        title: "Nyomtatás",
        desc: "A vitamin naptár nyomtatása.",
        impact: "Eltűnik a nyomtatás gomb."
    },

    // --- MUNKÁK ---
    "/munkak#approval_required": {
        title: "Kézi jóváhagyás szükséges",
        desc: "A dolgozók által beküldött munkaórák ellenőrzése.",
        impact: "Ha kikapcsolod: Automatikus elfogadás. Ha bekapcsolod: Vezetői VAGY az aktuális műszakos jóváhagyása szükséges."
    },

    // --- ÓLAK ---
    "/olak#add_new": {
        title: "Új Hozzáadása",
        desc: "Új istálló felvétele a rendszerbe.",
        impact: "Eltűnik az 'Új Hozzáadása' gomb."
    },
    "/olak#settings": {
        title: "Beállítások Gomb",
        desc: "A 'Beállítások' panel megnyitása az Ólak oldalon.",
        impact: "Nem érhetők el a speciális beállítások."
    },
    "/olak#settings_order": {
        title: "Beállítások - Sorrend",
        desc: "Az istállók sorrendjének módosítása.",
        impact: "Nem lehet átrendezni az ólakat."
    },
    "/olak#settings_groups": {
        title: "Beállítások - Csoportok",
        desc: "Istállók csoportba rendezése.",
        impact: "Nem lehet csoportokat létrehozni."
    },

    // --- MŰSZAKBEOSZTÁS ---
    "/muszakbeosztas#add_next_day": {
        title: "Következő nap hozzáadása",
        desc: "A naptár bővítése egy új nappal.",
        impact: "A felhasználó nem tudja bővíteni a beosztást."
    },
    "/muszakbeosztas#settings": {
        title: "Beállítások Panel",
        desc: "A műszakbeosztás konfigurációs panelje.",
        impact: "Eltűnik a fogaskerék ikon."
    },
    "/muszakbeosztas#settings_people": {
        title: "Beállítások - Műszakosok",
        desc: "Személyzet kezelése.",
        impact: "Nem lehet új embert felvenni vagy törölni."
    },
    "/muszakbeosztas#settings_order": {
        title: "Beállítások - Sorrend",
        desc: "A műszakosok rotációs sorrendje.",
        impact: "Nem módosítható a sorrend."
    },
    "/muszakbeosztas#settings_generate": {
        title: "Beállítások - Generálás",
        desc: "Automatikus beosztás generálása.",
        impact: "Nem érhető el az automatikus generálás."
    },
    "/muszakbeosztas#settings_params": {
        title: "Beállítások - Paraméterek",
        desc: "Műszak kezdete és hossza.",
        impact: "Nem állítható át a műszakváltás időpontja."
    },

    // --- TURNUS ---
    "/turnus#close_turnus": {
        title: "Turnus Lezárása",
        desc: "Az aktív turnus befejezése.",
        impact: "A felhasználó nem tudja lezárni a turnust."
    },
    "/turnus#open_old": {
        title: "Régi turnusok megnyitása",
        desc: "Lezárt turnus részleteinek megtekintése.",
        impact: "Az archív turnusok gombjai inaktívak lesznek."
    },

    // --- BETELEPÍTÉS ---
    "/betelepites#close_turnus": {
        title: "Turnus Lezárása (Betelepítésnél)",
        desc: "Gyorsgomb a turnus lezárásához.",
        impact: "Eltűnik a lezárás gomb."
    },

    // --- BEÁLLÍTÁSOK (TABS & SYSTEMS) ---
    "/settings#general": {
        title: "Általános Fül",
        desc: "Rendszer alapbeállítások elérése.",
        impact: "Eltűnik az Általános fül."
    },
    "/settings#style": {
        title: "Megjelenés & Stílus",
        desc: "Témák és színek testreszabása.",
        impact: "Eltűnik a Megjelenés fül."
    },
    "/settings#language": {
        title: "Nyelv",
        desc: "Nyelvválasztó felület.",
        impact: "Eltűnik a Nyelv fül."
    },
    "/settings#integration": {
        title: "Integrációk",
        desc: "API kapcsolatok (Opticon, Rainbow).",
        impact: "Eltűnik az Integrációk fül."
    },
    "/settings#permissions": {
        title: "Jogosultságok",
        desc: "Ez a felület, a jogok kezelése.",
        impact: "Ha ezt elveszed, kizárod magad a jogkezelésből!"
    },
    "/settings#system_notifications": {
        title: "Rendszer - Értesítések",
        desc: "Értesítések ki/bekapcsolása.",
        impact: "Nem módosítható az értesítési beállítás."
    },
    "/settings#system_autosave": {
        title: "Rendszer - Automatikus mentés",
        desc: "Adatok automatikus mentése.",
        impact: "Nem kapcsolható ki/be az automata mentés."
    },
    "/settings#system_sound": {
        title: "Rendszer - Hangok",
        desc: "Hangeffektek beállítása.",
        impact: "Nem módosíthatók a hangbeállítások."
    },
    "/settings#system_animations": {
        title: "Rendszer - Animációk",
        desc: "Felület animációinak engedélyezése.",
        impact: "Nem kapcsolhatók ki az animációk."
    },
    "/settings#system_offline": {
        title: "Rendszer - Offline mód",
        desc: "Működés internetkapcsolat nélkül.",
        impact: "Nem módosítható az offline mód."
    },
    "/settings#seed_users": {
        title: "Felhasználók Generálása",
        desc: "Új felhasználók (dolgozó, főnök, admin) létrehozása.",
        impact: "A felhasználó nem látja a 'Felhasználók' fület a beállításokban."
    }
};

export default function PermissionsTab() {
    const { user } = useAuth();
    const { t } = useLanguage();
    const [permissions, setPermissions] = useState<PermissionsMatrix>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        const data = await getPermissions();
        setPermissions(data);
        setLoading(false);
    };

    const handleToggle = (role: "főnök" | "dolgozó", route: string, checked: boolean) => {
        setPermissions((prev) => ({
            ...prev,
            [role]: {
                ...prev[role],
                [route]: checked,
            },
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await savePermissions(permissions);
            toast({
                title: t("common.saved"),
                description: "A jogosultságok sikeresen mentve.",
            });
        } catch (error) {
            toast({
                title: t("common.error"),
                description: "Hiba történt a mentés során.",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const canEditBoss = user?.role === "admin";
    const canEditWorker = user?.role === "admin" || user?.role === "főnök";

    // Helper komponens a tooltiphez
    const InfoTooltip = ({ route }: { route: string }) => {
        const info = permissionDescriptions[route];

        if (!info) return null;

        return (
            <TooltipProvider>
                <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                        <div className="cursor-help inline-flex items-center justify-center ml-2 group relative z-10">
                            <div className="bg-emerald-100 group-hover:bg-emerald-200 text-emerald-600 rounded-full p-0.5 transition-colors shadow-sm">
                                <HelpCircle className="h-3.5 w-3.5" />
                            </div>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm bg-slate-900 text-slate-100 border-slate-700 p-4 shadow-xl z-50">
                        <div className="space-y-2">
                            <h4 className="font-bold text-emerald-400 text-sm border-b border-slate-700 pb-1">
                                {info.title}
                            </h4>
                            <p className="text-xs text-slate-300 leading-relaxed">
                                {info.desc}
                            </p>
                            <div className="bg-red-900/20 border border-red-900/40 rounded p-2 mt-2">
                                <p className="text-xs text-red-200 font-medium">
                                    <span className="font-bold text-red-400 uppercase text-[10px] mr-1">Hatás:</span>
                                    {info.impact}
                                </p>
                            </div>
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    };

    return (
        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Jogosultságok Kezelése
                </CardTitle>
                <CardDescription>
                    Állítsa be, hogy mely szerepkörök mely menüpontokat láthatják.
                    Vigye az egeret a zöld kérdőjelek fölé a részletekért.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                            <tr>
                                <th className="px-4 py-3 rounded-tl-lg w-1/2">Menüpont / Funkció</th>
                                {canEditBoss && <th className="px-4 py-3 text-center w-1/4">Főnök</th>}
                                {canEditWorker && <th className="px-4 py-3 text-center w-1/4 rounded-tr-lg">Dolgozó</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {navigationConfig.map((item) => {
                                const bossAllowed = permissions.főnök?.[item.href] !== false;
                                const workerAllowed = permissions.dolgozó?.[item.href] !== false;

                                return (
                                    <>
                                        {/* FŐMENÜ SOR */}
                                        <tr key={item.href} className="border-b border-border hover:bg-muted/10 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center">
                                                    <item.icon className="h-4 w-4 text-muted-foreground mr-2" />
                                                    <span className="font-medium text-foreground">
                                                        {t(item.nameKey) || item.fallbackName || item.href}
                                                    </span>

                                                    {/* FŐMENÜ TOOLTIP */}
                                                    <InfoTooltip route={item.href} />

                                                    <span className="text-[10px] text-muted-foreground font-mono ml-auto opacity-50 hidden sm:inline-block">
                                                        {item.href}
                                                    </span>
                                                </div>
                                            </td>

                                            {canEditBoss && (
                                                <td className="px-4 py-3 text-center bg-slate-50/50">
                                                    <Switch
                                                        checked={bossAllowed}
                                                        onCheckedChange={(c) => handleToggle("főnök", item.href, c)}
                                                    />
                                                </td>
                                            )}

                                            {canEditWorker && (
                                                <td className="px-4 py-3 text-center">
                                                    <Switch
                                                        checked={workerAllowed}
                                                        onCheckedChange={(c) => handleToggle("dolgozó", item.href, c)}
                                                    />
                                                </td>
                                            )}
                                        </tr>

                                        {/* ALMENÜ SOROK (ACTIONS) */}
                                        {item.actions?.map(action => {
                                            const actionKey = `${item.href}#${action.id}`;
                                            const bossActionAllowed = permissions.főnök?.[actionKey] !== false;
                                            const workerActionAllowed = permissions.dolgozó?.[actionKey] !== false;

                                            return (
                                                <tr key={actionKey} className="border-b border-border/50 bg-muted/5 hover:bg-muted/10 transition-colors">
                                                    <td className="px-4 py-2 pl-10 text-sm">
                                                        <div className="flex items-center text-muted-foreground">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mr-2" />
                                                            <span>{t(action.nameKey) || action.fallbackName || action.id}</span>

                                                            {/* ALMENÜ TOOLTIP */}
                                                            <InfoTooltip route={actionKey} />
                                                        </div>
                                                    </td>

                                                    {canEditBoss && (
                                                        <td className="px-4 py-2 text-center bg-slate-50/30">
                                                            <Switch
                                                                checked={bossActionAllowed}
                                                                onCheckedChange={(c) => handleToggle("főnök", actionKey, c)}
                                                                disabled={!bossAllowed}
                                                                className="scale-75 origin-center data-[state=checked]:bg-emerald-600"
                                                            />
                                                        </td>
                                                    )}

                                                    {canEditWorker && (
                                                        <td className="px-4 py-2 text-center">
                                                            <Switch
                                                                checked={workerActionAllowed}
                                                                onCheckedChange={(c) => handleToggle("dolgozó", actionKey, c)}
                                                                disabled={!workerAllowed}
                                                                className="scale-75 origin-center"
                                                            />
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-end pt-6">
                    <Button size="lg" onClick={handleSave} disabled={saving} className="shadow-xl bg-emerald-600 hover:bg-emerald-700">
                        {saving ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mentés...
                            </>
                        ) : (
                            <>
                                <Save className="mr-2 h-4 w-4" /> Változások Mentése
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
