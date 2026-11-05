import React from "react";
import { LayoutDashboard, FileText, Home, Users, Calendar, Settings, Bell, Map, ClipboardList, Skull, Activity, Scale, Beaker } from "lucide-react";

export type NavItemConfig = {
  nameKey: string; // Translation key
  href: string;
  icon: React.ComponentType<any>;
  fallbackName?: string; // Fallback if translation missing
  actions?: { id: string; nameKey: string; fallbackName?: string }[];
};

export const navigationConfig: NavItemConfig[] = [
  { nameKey: "menu.dashboard", href: "/", icon: LayoutDashboard },
  { nameKey: "menu.daily_log", href: "/napilap", icon: FileText },
  {
    nameKey: "menu.monitoring",
    href: "/felugyelet",
    icon: Activity,
    actions: [
      { id: "overview", nameKey: "permission.overview", fallbackName: "Áttekintés" },
      { id: "opticon", nameKey: "permission.opticon", fallbackName: "Klíma (Opticon)" },
      { id: "rainbow", nameKey: "permission.rainbow", fallbackName: "Etetés (Rainbow)" },
    ],
  },
  {
    nameKey: "menu.weights",
    href: "/merlegeles",
    icon: Scale,
    actions: [
      { id: "new_measurement", nameKey: "permission.new_measurement", fallbackName: "Új Mérés Rögzítése" },
      { id: "pdf_export", nameKey: "permission.pdf_export", fallbackName: "PDF Letöltés" },
      { id: "csv_export", nameKey: "permission.csv_export", fallbackName: "CSV Letöltés" },
      { id: "archive", nameKey: "permission.archive", fallbackName: "Archívum" },
      { id: "import", nameKey: "permission.import", fallbackName: "Importálás" },
    ],
  },
  {
    nameKey: "menu.mortality",
    href: "/elhulasok",
    icon: Skull,
    actions: [
      { id: "pdf_export", nameKey: "permission.pdf_export", fallbackName: "PDF Letöltés" },
    ],
  },
  {
    nameKey: "menu.vitamin_plan",
    href: "/vitamin-terv",
    icon: Beaker,
    fallbackName: "Vitamin Terv",
    actions: [
      { id: "edit", nameKey: "permission.edit", fallbackName: "Szerkesztés" },
      { id: "print", nameKey: "permission.print", fallbackName: "Nyomtatás" },
    ],
  },
  {
    nameKey: "menu.works",
    href: "/munkak",
    icon: ClipboardList,
    actions: [
      { id: "approval_required", nameKey: "works.approval_required", fallbackName: "Munkaórák jóváhagyása" },
    ],
  },
  { nameKey: "menu.messages", href: "/uzenetek", icon: Bell },
  {
    nameKey: "menu.barns",
    href: "/olak",
    icon: Home,
    actions: [
      { id: "add_new", nameKey: "permission.add_new", fallbackName: "Új Hozzáadása" },
      { id: "settings", nameKey: "permission.settings", fallbackName: "Beállítások" },
      { id: "settings_order", nameKey: "permission.settings_order", fallbackName: "Beállítások - Sorrend" },
      { id: "settings_groups", nameKey: "permission.settings_groups", fallbackName: "Beállítások - Csoportok" },
    ],
  },
  { nameKey: "menu.barn_map", href: "/istallo-terkep", icon: Map },
  { nameKey: "menu.barn_editor", href: "/istallo-szerkeszto", icon: Map },
  {
    nameKey: "menu.schedule",
    href: "/muszakbeosztas",
    icon: Users,
    actions: [
      { id: "add_next_day", nameKey: "permission.add_next_day", fallbackName: "Következő nap hozzáadása" },
      { id: "settings", nameKey: "permission.settings", fallbackName: "Beállítások" },
      { id: "settings_people", nameKey: "permission.settings_people", fallbackName: "Beállítások - Műszakosok" },
      { id: "settings_order", nameKey: "permission.settings_order", fallbackName: "Beállítások - Sorrend" },
      { id: "settings_generate", nameKey: "permission.settings_generate", fallbackName: "Beállítások - Generálás" },
      { id: "settings_params", nameKey: "permission.settings_params", fallbackName: "Beállítások - Paraméterek" },
    ],
  },
  {
    nameKey: "menu.batch",
    href: "/turnus",
    icon: Calendar,
    actions: [
      { id: "close_turnus", nameKey: "permission.close_turnus", fallbackName: "Turnus lezárása" },
      { id: "open_old", nameKey: "permission.open_old", fallbackName: "Régi turnusok megnyitása" },
    ],
  },
  {
    nameKey: "menu.deploy",
    href: "/betelepites",
    icon: Home,
    actions: [
      { id: "close_turnus", nameKey: "permission.close_turnus", fallbackName: "Turnus Lezárása" },
    ],
  },
  {
    nameKey: "menu.settings",
    href: "/settings",
    icon: Settings,
    actions: [
      { id: "general", nameKey: "settings.tab.general", fallbackName: "Általános" },
      { id: "style", nameKey: "settings.tab.style", fallbackName: "Megjelenés & Stílus" },
      { id: "language", nameKey: "settings.tab.language", fallbackName: "Nyelv" },
      { id: "integration", nameKey: "settings.tab.integration", fallbackName: "Integrációk" },
      { id: "permissions", nameKey: "settings.tab.permissions", fallbackName: "Jogosultságok" },
      { id: "system_notifications", nameKey: "settings.system.notifications", fallbackName: "Rendszer - Értesítések" },
      { id: "system_autosave", nameKey: "settings.system.autosave", fallbackName: "Rendszer - Automatikus mentés" },
      { id: "system_sound", nameKey: "settings.system.sound", fallbackName: "Rendszer - Hangeffektek" },
      { id: "system_animations", nameKey: "settings.system.animations", fallbackName: "R Sistem - Animációk" },
      { id: "system_offline", nameKey: "settings.system.offline", fallbackName: "Rendszer - Offline mód" },
      { id: "seed_users", nameKey: "permission.seed_users", fallbackName: "Felhasználók Generálása" },
    ],
  },
];
