// src/contexts/FarmContext.tsx
import React, { createContext, useContext, useState, useEffect } from "react";

type FarmContextType = {
  farmId: string | null;
  farmName: string | null;
  selectFarm: (id: string, name: string) => void;
  clearFarm: () => void;
};

const FarmContext = createContext<FarmContextType | undefined>(undefined);

export function FarmProvider({ children }: { children: React.ReactNode }) {
  const [farmId, setFarmId] = useState<string | null>(null);
  const [farmName, setFarmName] = useState<string | null>(null);

  useEffect(() => {
    const storedId = localStorage.getItem("current_farm_id");
    const storedName = localStorage.getItem("current_farm_name");
    if (storedId) {
      setFarmId(storedId);
      setFarmName(storedName);
    }
  }, []);

  const selectFarm = (id: string, name: string) => {
    setFarmId(id);
    setFarmName(name);
    localStorage.setItem("current_farm_id", id);
    localStorage.setItem("current_farm_name", name);
    // Újratöltjük az oldalt, hogy tiszta lappal induljon a belső app
    window.location.reload();
  };

  const clearFarm = () => {
    setFarmId(null);
    setFarmName(null);
    localStorage.removeItem("current_farm_id");
    localStorage.removeItem("current_farm_name");
    window.location.href = "/";
  };

  return (
    <FarmContext.Provider value={{ farmId, farmName, selectFarm, clearFarm }}>
      {children}
    </FarmContext.Provider>
  );
}

export const useFarm = () => {
  const context = useContext(FarmContext);
  if (!context) throw new Error("useFarm must be used within FarmProvider");
  return context;
};
