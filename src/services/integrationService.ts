import { getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { farmDoc } from "@/lib/farmDb"; // <--- FONTOS IMPORT

export type IntegrationConfig = {
  useSimulation: boolean;
  opticon: {
    enabled: boolean;
    apiUrl: string;
    apiKey: string;
  };
  rainbow: {
    enabled: boolean;
    apiUrl: string;
    apiKey: string;
  };
};

const DEFAULT_CONFIG: IntegrationConfig = {
  useSimulation: true,
  opticon: { enabled: false, apiUrl: "", apiKey: "" },
  rainbow: { enabled: false, apiUrl: "", apiKey: "" },
};

export async function getIntegrationSettings(): Promise<IntegrationConfig> {
  try {
    // farmDoc használata: farms/{farmId}/settings/integrations
    const docRef = farmDoc("settings", "integrations");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { ...DEFAULT_CONFIG, ...snap.data() } as IntegrationConfig;
    }
    return DEFAULT_CONFIG;
  } catch (e) {
    console.error("Hiba az integrációs beállítások betöltésekor:", e);
    return DEFAULT_CONFIG;
  }
}

export async function saveIntegrationSettings(config: IntegrationConfig) {
  const docRef = farmDoc("settings", "integrations");
  await setDoc(docRef, { ...config, updatedAt: serverTimestamp() }, { merge: true });
}

// --- ADAT TÍPUSOK (Változatlan) ---

export type SiloData = {
  id: number;
  currentWeight: number;
  maxCapacity: number; 
  percentage: number;
  dailyConsumption: number;
  status: "ok" | "low" | "critical";
};

export type ClimateData = {
    tempInside: number;
    tempOutside: number;
    humidity: number;
    ventilationLevel: number;
    waterFlow: number;
    heatingStatus: boolean;
};

// --- ADATLEKÉRÉS (Változatlan, csak a configot kapja paraméterként) ---

export async function fetchSiloData(config: IntegrationConfig["rainbow"], simulate: boolean): Promise<SiloData[]> {
  if (!config.enabled) return [];

  if (simulate) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const simulatedSilos = [
            { id: 1, max: 15000, current: 8400, usage: 450 }, 
            { id: 2, max: 8000, current: 1200, usage: 210 }   
        ];

        const data: SiloData[] = simulatedSilos.map(s => {
            const pct = (s.current / s.max) * 100;
            let status: any = "ok";
            if (pct < 20) status = "low";
            if (pct < 10) status = "critical";

            return {
                id: s.id,
                currentWeight: s.current,
                maxCapacity: s.max, 
                percentage: pct,
                dailyConsumption: s.usage,
                status: status
            };
        });
        resolve(data);
      }, 500);
    });
  }

  try {
      if (!config.apiUrl) throw new Error("Nincs megadva API URL");

      const response = await fetch(config.apiUrl, {
          method: 'GET',
          headers: {
              'Authorization': config.apiKey ? `Bearer ${config.apiKey}` : '',
              'Content-Type': 'application/json'
          }
      });

      if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
      
      const rawData = await response.json();
      return mapRawToSiloData(rawData);

  } catch (error) {
      console.error("Rainbow API hiba:", error);
      return []; 
  }
}

export async function fetchOpticonData(config: IntegrationConfig["opticon"], simulate: boolean): Promise<ClimateData | null> {
    if (!config.enabled) return null;

    if (simulate) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const tempIn = 24.5 + (Math.random() * 1.5 - 0.75);
                const tempOut = 15 + (Math.random() * 5);
                const vent = tempIn > 25 ? Math.floor(Math.random() * 40) + 60 : Math.floor(Math.random() * 20) + 10;
                
                resolve({
                    tempInside: tempIn,
                    tempOutside: tempOut,
                    humidity: 60 + (Math.random() * 10 - 5),
                    ventilationLevel: vent,
                    waterFlow: Math.floor(Math.random() * 200) + 50,
                    heatingStatus: tempIn < 22
                });
            }, 500);
        });
    }

    try {
        if (!config.apiUrl) throw new Error("Nincs megadva API URL");
        const response = await fetch(config.apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': config.apiKey ? `Bearer ${config.apiKey}` : '',
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) throw new Error(`Hálózati hiba: ${response.status}`);
        const rawData = await response.json();
        return mapRawToOpticonData(rawData);
    } catch (error) {
        console.error("Opticon API hiba:", error);
        return null;
    }
}

function mapRawToSiloData(json: any): SiloData[] {
    if (Array.isArray(json)) {
        return json.map((item: any, index: number) => {
            const currentWeight = Number(item.weight || item.current || item.level || 0);
            const maxCapacity = Number(item.capacity || item.max || item.full_weight || 10000);
            const pct = maxCapacity > 0 ? (currentWeight / maxCapacity) * 100 : 0;
            let status: any = "ok";
            if (pct < 20) status = "low";
            if (pct < 10) status = "critical";

            return {
                id: item.siloId || item.id || index + 1,
                currentWeight: currentWeight,
                maxCapacity: maxCapacity, 
                percentage: pct,
                dailyConsumption: Number(item.usage || item.daily || 0),
                status: status
            };
        });
    }
    return [];
}

function mapRawToOpticonData(json: any): ClimateData {
    return {
        tempInside: Number(json.tempInside || json.t_in || 0),
        tempOutside: Number(json.tempOutside || json.t_out || 0),
        humidity: Number(json.humidity || json.rh || 0),
        ventilationLevel: Number(json.ventilation || json.vent_pct || 0),
        waterFlow: Number(json.waterFlow || json.water || 0),
        heatingStatus: Boolean(json.heating || json.heater_on || false)
    };
}
