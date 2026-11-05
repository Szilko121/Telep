import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext"; // <--- FONTOS: Auth importálása
import {
    Check, Link, Volume2, BatteryMedium, CloudOff, CheckCircle2,
    Globe, Settings2, Palette, Shield, Server, FlaskConical, Database, Save,
    Eye, UserPlus // <--- ÚJ: UserPlus ikon importálása
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getIntegrationSettings, saveIntegrationSettings, type IntegrationConfig } from "@/services/integrationService";
import PermissionsTab from "@/components/settings/PermissionsTab";
import WatchlistSettings from "@/components/settings/WatchlistSettings"; // <--- ÚJ: Komponens importálása
import UserGenerator from "@/components/settings/UserGenerator"; // <--- ÚJ: UserGenerator importálása
import { usePermissions } from "@/services/permissionsService"; // <--- ÚJ: usePermissions importálása

// --- Témák ---
const themes = [
    { id: "default", name: "Alapértelmezett", colors: ["#2d7a4e", "#3b82c8", "#f59e0b"] },
    { id: "neon", name: "Neon Üveg", colors: ["#00ff88", "#ff00ff", "#00ffff"] },
    { id: "forest", name: "Erdő", colors: ["#2d5016", "#4a7c2c", "#8bc34a"] },
    { id: "ocean", name: "Óceán", colors: ["#0c4a6e", "#0284c7", "#38bdf8"] },
    { id: "sunset", name: "Napnyugta", colors: ["#dc2626", "#f97316", "#fb923c"] },
    { id: "purple", name: "Lila Álom", colors: ["#9333ea", "#c026d3", "#ec4899"] },
    { id: "amber", name: "Borostyán", colors: ["#f59e0b", "#f97316", "#fbbf24"] }
];

// --- Nyelvek ---
const languages = [
    { code: "hu", flag: "🇭🇺" },
    { code: "en", flag: "🇬🇧" },
    { code: "de", flag: "🇩🇪" },
    { code: "fr", flag: "🇫🇷" },
    { code: "pl", flag: "🇵🇱" },
    { code: "ro", flag: "🇷🇴" },
    { code: "cs", flag: "🇨🇿" },
    { code: "sk", flag: "🇸🇰" },
    { code: "sr", flag: "🇷🇸" },
    { code: "es", flag: "🇪🇸" },
    { code: "it", flag: "🇮🇹" },
    { code: "nl", flag: "🇳🇱" },
    { code: "da", flag: "🇩🇰" },
    { code: "tr", flag: "🇹🇷" },
    { code: "pt", flag: "🇵🇹" },
    { code: "ru", flag: "🇷🇺" },
];

export default function Settings() {
    const { theme: currentTheme, setTheme } = useTheme();
    const { t, language, setLanguage } = useLanguage();
    const { user } = useAuth(); // <--- Felhasználó lekérése
    const { isRouteAllowed } = usePermissions(); // <--- Jogosultság ellenőrzés

    // Jogosultságok kezelése (Admin VAGY Főnök)
    const canManagePermissions = user?.role === "admin" || user?.role === "főnök";

    // --- KIZÁRÓLAG ADMIN JOG (A Figyelőlistához) ---
    // Ez biztosítja, hogy a főnök se lássa!
    const isAdmin = user?.role === "admin";

    // ÚJ: Felhasználó generálás joga (Settings -> seed_users)
    // Alapértelmezetten csak admin/főnök, de felülbírálható a permissionsService-ben
    const canSeedUsers = isRouteAllowed(user?.role, "/settings#seed_users");

    // Integrációs state
    const [integrations, setIntegrations] = useState<IntegrationConfig>({
        useSimulation: true,
        opticon: { enabled: false, apiUrl: "", apiKey: "" },
        rainbow: { enabled: false, apiUrl: "", apiKey: "" }
    });
    const [loadingInt, setLoadingInt] = useState(false);

    // Általános beállítások state
    const [generalSettings, setGeneralSettings] = useState({
        notifications: true,
        autoSave: true,
        sound: false,
        animations: false,
        offlineMode: false
    });

    useEffect(() => {
        (async () => {
            const settings = await getIntegrationSettings();
            setIntegrations(settings);
        })();
    }, []);

    const handleSaveIntegrations = async () => {
        setLoadingInt(true);
        try {
            await saveIntegrationSettings(integrations);
            toast({
                title: t("common.saved"),
                description: t("settings.toast.success")
            });
        } catch (e) {
            toast({
                title: t("common.error"),
                description: t("settings.toast.fail"),
                variant: "destructive"
            });
        } finally {
            setLoadingInt(false);
        }
    };

    const toggleGeneral = (key: keyof typeof generalSettings) => {
        setGeneralSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="container mx-auto py-6 max-w-7xl px-4">
            <div className="mb-8 mt-4">
                <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-2">{t("settings.title")}</h1>
                <p className="text-muted-foreground text-lg">{t("settings.subtitle")}</p>
            </div>

            {/* FŐ LAYOUT: Bal oldali menü + Jobb oldali tartalom */}
            <Tabs defaultValue="general" className="flex flex-col md:flex-row gap-8">

                {/* OLDALSÁV MENÜ */}
                <aside className="w-full md:w-64 flex-shrink-0">
                    <TabsList className="flex flex-col h-auto items-stretch bg-transparent space-y-2 p-0">
                        <TabsTrigger
                            value="general"
                            className="justify-start px-4 py-3 text-base data-[state=active]:bg-secondary data-[state=active]:text-foreground transition-all rounded-md"
                        >
                            <Settings2 className="mr-3 h-5 w-5" />
                            {t("settings.tab.general")}
                        </TabsTrigger>

                        <TabsTrigger
                            value="style"
                            className="justify-start px-4 py-3 text-base data-[state=active]:bg-secondary data-[state=active]:text-foreground transition-all rounded-md"
                        >
                            <Palette className="mr-3 h-5 w-5" />
                            {t("settings.tab.style")}
                        </TabsTrigger>

                        <TabsTrigger
                            value="language"
                            className="justify-start px-4 py-3 text-base data-[state=active]:bg-secondary data-[state=active]:text-foreground transition-all rounded-md"
                        >
                            <Globe className="mr-3 h-5 w-5" />
                            {t("settings.tab.language")}
                        </TabsTrigger>

                        <TabsTrigger
                            value="integration"
                            className="justify-start px-4 py-3 text-base data-[state=active]:bg-secondary data-[state=active]:text-foreground transition-all rounded-md"
                        >
                            <Link className="mr-3 h-5 w-5" />
                            {t("settings.tab.integration")}
                        </TabsTrigger>

                        {/* JOGOSULTSÁGOK (Admin + Főnök láthatja) */}
                        {canManagePermissions && (
                            <TabsTrigger
                                value="permissions"
                                className="justify-start px-4 py-3 text-base data-[state=active]:bg-secondary data-[state=active]:text-foreground transition-all rounded-md"
                            >
                                <Shield className="mr-3 h-5 w-5" />
                                Jogosultságok
                            </TabsTrigger>
                        )}

                        {/* FELHASZNÁLÓK (Jogosultság függő) */}
                        {canSeedUsers && (
                            <TabsTrigger
                                value="users"
                                className="justify-start px-4 py-3 text-base data-[state=active]:bg-secondary data-[state=active]:text-foreground transition-all rounded-md"
                            >
                                <UserPlus className="mr-3 h-5 w-5" />
                                Felhasználók
                            </TabsTrigger>
                        )}

                        {/* --- FIGYELŐLISTA (CSAK ADMIN LÁTHATJA!) --- */}
                        {isAdmin && (
                            <TabsTrigger
                                value="watchlist"
                                className="justify-start px-4 py-3 text-base data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-900 transition-all rounded-md text-indigo-600 hover:bg-indigo-50/50 font-medium"
                            >
                                <Eye className="mr-3 h-5 w-5" />
                                Figyelőlista
                            </TabsTrigger>
                        )}
                    </TabsList>
                </aside>

                {/* TARTALOM TERÜLET */}
                <main className="flex-1 min-w-0">

                    {/* 1. ÁLTALÁNOS */}
                    <TabsContent value="general" className="space-y-6 mt-0 animate-in fade-in-50 slide-in-from-right-5">
                        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
                            <CardHeader>
                                <CardTitle>{t("settings.gen.system_title")}</CardTitle>
                                <CardDescription>{t("settings.gen.system_desc")}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-base">{t("settings.gen.notifications")}</Label>
                                        <p className="text-sm text-muted-foreground">{t("settings.gen.notifications_desc")}</p>
                                    </div>
                                    <Switch checked={generalSettings.notifications} onCheckedChange={() => toggleGeneral('notifications')} />
                                </div>
                                <Separator />
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-base">{t("settings.gen.autosave")}</Label>
                                        <p className="text-sm text-muted-foreground">{t("settings.gen.autosave_desc")}</p>
                                    </div>
                                    <Switch checked={generalSettings.autoSave} onCheckedChange={() => toggleGeneral('autoSave')} />
                                </div>
                                <Separator />
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                            <Volume2 className="h-4 w-4 text-muted-foreground" />
                                            <Label className="text-base">{t("settings.gen.sound")}</Label>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{t("settings.gen.sound_desc")}</p>
                                    </div>
                                    <Switch checked={generalSettings.sound} onCheckedChange={() => toggleGeneral('sound')} />
                                </div>
                                <Separator />
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                            <BatteryMedium className="h-4 w-4 text-muted-foreground" />
                                            <Label className="text-base">{t("settings.gen.animations")}</Label>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{t("settings.gen.animations_desc")}</p>
                                    </div>
                                    <Switch checked={generalSettings.animations} onCheckedChange={() => toggleGeneral('animations')} />
                                </div>
                                <Separator />
                                <div className="flex items-center justify-between opacity-80">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                            <CloudOff className="h-4 w-4 text-muted-foreground" />
                                            <Label className="text-base">{t("settings.gen.offline")}</Label>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{t("settings.gen.offline_desc")}</p>
                                    </div>
                                    <Switch checked={generalSettings.offlineMode} onCheckedChange={() => toggleGeneral('offlineMode')} />
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* 2. MEGJELENÉS */}
                    <TabsContent value="style" className="space-y-6 mt-0 animate-in fade-in-50 slide-in-from-right-5">
                        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
                            <CardHeader>
                                <CardTitle>{t("settings.style.title")}</CardTitle>
                                <CardDescription>{t("settings.style.desc")}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {themes.map((theme) => (
                                        <button
                                            key={theme.id}
                                            onClick={() => setTheme(theme.id as any)}
                                            className={`relative group overflow-hidden rounded-xl border-2 p-4 text-left transition-all duration-200 ${currentTheme === theme.id
                                                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                                : "border-muted hover:border-primary/50 hover:bg-accent"
                                                }`}
                                        >
                                            {currentTheme === theme.id && (
                                                <div className="absolute right-3 top-3 h-6 w-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                                                    <Check className="h-3 w-3" />
                                                </div>
                                            )}
                                            <h3 className="font-semibold text-foreground">{theme.name}</h3>
                                            <div className="flex gap-2 mt-3">
                                                {theme.colors.map((color, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="h-6 w-6 rounded-full border border-background/20 shadow-sm"
                                                        style={{ backgroundColor: color }}
                                                    />
                                                ))}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* 3. NYELV */}
                    <TabsContent value="language" className="space-y-6 mt-0 animate-in fade-in-50 slide-in-from-right-5">
                        <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Globe className="h-5 w-5 text-primary" />
                                    {t("settings.lang.title")}
                                </CardTitle>
                                <CardDescription>{t("settings.lang.desc")}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                    {languages.map((lang) => {
                                        const isSelected = language === lang.code;
                                        return (
                                            <button
                                                key={lang.code}
                                                onClick={() => setLanguage(lang.code as any)}
                                                className={`relative flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all duration-200 cursor-pointer hover:shadow-md ${isSelected
                                                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                                    : "border-muted hover:border-primary/30 hover:bg-accent/50"
                                                    }`}
                                            >
                                                {isSelected && (
                                                    <div className="absolute top-2 right-2 text-primary">
                                                        <CheckCircle2 className="h-5 w-5" />
                                                    </div>
                                                )}
                                                <span className="text-4xl mb-3 drop-shadow-sm filter grayscale-[20%] hover:grayscale-0 transition-all">{lang.flag}</span>
                                                <span className={`font-medium text-center ${isSelected ? "text-primary font-bold" : "text-foreground"}`}>
                                                    {t(`settings.lang.${lang.code}`)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* 4. INTEGRÁCIÓK */}
                    <TabsContent value="integration" className="space-y-6 mt-0 animate-in fade-in-50 slide-in-from-right-5">
                        <Card className="border-blue-200 bg-blue-50/30 dark:bg-blue-950/10 dark:border-blue-900">
                            <CardContent className="pt-6">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-blue-100 dark:bg-blue-900 p-3 rounded-full text-blue-600 dark:text-blue-200">
                                            <FlaskConical className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <Label htmlFor="sim-mode" className="text-base font-bold text-blue-900 dark:text-blue-100">{t("settings.int.sim_title")}</Label>
                                            <p className="text-sm text-blue-700/80 dark:text-blue-300/80 mt-1">
                                                {t("settings.int.sim_desc")}
                                            </p>
                                        </div>
                                    </div>
                                    <Switch
                                        id="sim-mode"
                                        checked={integrations.useSimulation}
                                        onCheckedChange={(c) => setIntegrations(s => ({ ...s, useSimulation: c }))}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Server className="h-5 w-5 text-sky-600" />
                                    {t("settings.int.opticon_title")}
                                </CardTitle>
                                <CardDescription>{t("settings.int.opticon_desc")}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
                                    <Label htmlFor="opticon-active" className="font-medium text-base cursor-pointer">{t("settings.int.enable")}</Label>
                                    <Switch
                                        id="opticon-active"
                                        checked={integrations.opticon.enabled}
                                        onCheckedChange={(c) => setIntegrations(s => ({ ...s, opticon: { ...s.opticon, enabled: c } }))}
                                    />
                                </div>

                                {integrations.opticon.enabled && (
                                    <div className="grid gap-4 p-4 border-l-4 border-sky-500 bg-sky-50/10 animate-in slide-in-from-top-2">
                                        <div className="grid gap-2">
                                            <Label>{t("settings.int.api_url")}</Label>
                                            <Input
                                                placeholder="http://192.168.x.x/api/v1/status"
                                                value={integrations.opticon.apiUrl}
                                                onChange={e => setIntegrations(s => ({ ...s, opticon: { ...s.opticon, apiUrl: e.target.value } }))}
                                                disabled={integrations.useSimulation}
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>{t("settings.int.api_key")}</Label>
                                            <Input
                                                type="password"
                                                value={integrations.opticon.apiKey}
                                                onChange={e => setIntegrations(s => ({ ...s, opticon: { ...s.opticon, apiKey: e.target.value } }))}
                                                disabled={integrations.useSimulation}
                                            />
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Database className="h-5 w-5 text-amber-600" />
                                    {t("settings.int.rainbow_title")}
                                </CardTitle>
                                <CardDescription>{t("settings.int.rainbow_desc")}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
                                    <Label htmlFor="rainbow-active" className="font-medium text-base cursor-pointer">{t("settings.int.enable")}</Label>
                                    <Switch
                                        id="rainbow-active"
                                        checked={integrations.rainbow.enabled}
                                        onCheckedChange={(c) => setIntegrations(s => ({ ...s, rainbow: { ...s.rainbow, enabled: c } }))}
                                    />
                                </div>

                                {integrations.rainbow.enabled && (
                                    <div className="grid gap-4 p-4 border-l-4 border-amber-500 bg-amber-50/10 animate-in slide-in-from-top-2">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="col-span-2 md:col-span-2">
                                                <Label>{t("settings.int.api_url")}</Label>
                                                <Input
                                                    placeholder="http://192.168.x.y/api/silo"
                                                    value={integrations.rainbow.apiUrl}
                                                    onChange={e => setIntegrations(s => ({ ...s, rainbow: { ...s.rainbow, apiUrl: e.target.value } }))}
                                                    disabled={integrations.useSimulation}
                                                />
                                            </div>
                                            <div className="col-span-2 md:col-span-2">
                                                <Label>{t("settings.int.api_key")}</Label>
                                                <Input
                                                    type="password"
                                                    value={integrations.rainbow.apiKey}
                                                    onChange={e => setIntegrations(s => ({ ...s, rainbow: { ...s.rainbow, apiKey: e.target.value } }))}
                                                    disabled={integrations.useSimulation}
                                                />
                                            </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                                            ℹ️ {t("settings.int.rainbow_note")}
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <div className="flex justify-end pt-4 sticky bottom-6">
                            <Button size="lg" onClick={handleSaveIntegrations} disabled={loadingInt} className="shadow-xl">
                                {loadingInt ? t("common.saving") : <><Save className="mr-2 h-4 w-4" /> {t("settings.save_btn")}</>}
                            </Button>
                        </div>
                    </TabsContent>

                    {/* 5. JOGOSULTSÁGOK (Admin + Főnök) */}
                    {canManagePermissions && (
                        <TabsContent value="permissions" className="space-y-6 mt-0 animate-in fade-in-50 slide-in-from-right-5">
                            <PermissionsTab />
                        </TabsContent>
                    )}

                    {/* 6. FELHASZNÁLÓK (Jogosultság függő) */}
                    {canSeedUsers && (
                        <TabsContent value="users" className="space-y-6 mt-0 animate-in fade-in-50 slide-in-from-right-5">
                            <UserGenerator />
                        </TabsContent>
                    )}

                    {/* 7. FIGYELŐLISTA (CSAK ADMIN!) */}
                    {isAdmin && (
                        <TabsContent value="watchlist" className="space-y-6 mt-0 animate-in fade-in-50 slide-in-from-right-5">
                            <WatchlistSettings />
                        </TabsContent>
                    )}

                </main>
            </Tabs>
        </div>
    );
}
