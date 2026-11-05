// src/pages/AppLayout.tsx
import { Link, Outlet, useLocation } from "react-router-dom"
import { LayoutDashboard, Map, FileText, Gauge, Clock, Scale, Wheat, Skull } from "lucide-react"
import { useLanguage } from "@/contexts/LanguageContext" // <--- ÚJ IMPORT

export function AppLayout() {
  const location = useLocation()
  const { t } = useLanguage() // <--- NYELVI HOOK

  // A menü definíciót beköltöztettük ide, hogy használhassa a t() függvényt
  const navItems = [
    { path: "/", icon: LayoutDashboard, label: t("menu.dashboard") },
    { path: "/daily-log", icon: FileText, label: t("menu.daily_log") },
    { path: "/meters", icon: Gauge, label: t("menu.meters") }, // Új kulcs
    { path: "/timesheets", icon: Clock, label: t("menu.timesheets") }, // Új kulcs
    { path: "/weights", icon: Scale, label: t("menu.weights") }, // Új kulcs
    { path: "/feed", icon: Wheat, label: t("menu.feed") }, // Új kulcs
    { path: "/istallo-terkep", icon: Map, label: t("menu.barn_map") },
    { path: "/istallo-szerkeszto", icon: Map, label: t("menu.barn_editor") },
    { path: "/elhulasok", icon: Skull, label: t("menu.mortality") },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-xl font-bold text-brand-600">{t("app.title")}</h1>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Navigation */}
        <nav className="w-20 md:w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-65px)] sticky top-[65px]">
          <ul className="py-4">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path

              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      isActive
                        ? "bg-brand-50 text-brand-600 border-r-4 border-brand-600"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="hidden md:block font-medium">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
