// src/contexts/LanguageContext.tsx
import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";

// --- Nyelvi fájlok importálása ---
import { hu } from "../locales/hu";
import { en } from "../locales/en";
import { de } from "../locales/de";
import { fr } from "../locales/fr";
import { pl } from "../locales/pl";
import { ro } from "../locales/ro";
import { cs } from "../locales/cs";
import { sk } from "../locales/sk";
import { sr } from "../locales/sr";
import { es } from "../locales/es";
import { it } from "../locales/it";
import { nl } from "../locales/nl";
import { da } from "../locales/da";
import { tr } from "../locales/tr";
import { pt } from "../locales/pt";
import { ru } from "../locales/ru";

// --- Nyelvek összekapcsolása ---
const translations = {
  hu, en, de, fr, pl, ro, cs, sk, sr, es, it, nl, da, tr, pt, ru
};

// A "Language" típus automatikusan felveszi a translations kulcsait
export type Language = keyof typeof translations;

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  // Nyelv inicializálása
  const [language, setLanguageState] = useState<Language>(() => {
    // 1. Ellenőrizzük a localStorage-t
    const saved = localStorage.getItem("app-language");
    if (saved && Object.keys(translations).includes(saved)) {
      return saved as Language;
    }

    // 2. Ha nincs mentett, ellenőrizzük a böngésző nyelvét
    const browserLang = navigator.language.split('-')[0]; // pl. "hu-HU" -> "hu"
    
    // Ha a böngésző nyelve támogatott, használjuk azt
    if (Object.keys(translations).includes(browserLang)) {
        return browserLang as Language;
    }

    // 3. Fallback alapértelmezett nyelv (pl. magyar vagy angol)
    return "hu";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    // Mentés localStorage-ba, hogy megjegyezze a választást
    localStorage.setItem("app-language", lang);
    
    // Opcionális: HTML lang attribútum frissítése a jobb SEO/hozzáférhetőség érdekében
    document.documentElement.lang = lang;
  };

  // Induláskor állítsuk be a HTML lang attribútumot is
  useEffect(() => {
      document.documentElement.lang = language;
  }, [language]);

  const t = (key: string, params?: Record<string, string | number>): string => {
    // @ts-ignore
    let text = translations[language][key]; 
    
    // Ha nincs meg a fordítás az adott nyelven, megpróbáljuk angolul (fallback)
    if (!text) {
        // @ts-ignore
        text = translations["en"][key];
    }

    // Ha angolul sincs, visszaadjuk magát a kulcsot
    if (!text) {
        return key;
    }
    
    // Paraméterek behelyettesítése
    if (params) {
        Object.entries(params).forEach(([k, v]) => {
            text = text.replace(`{${k}}`, String(v));
        });
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
