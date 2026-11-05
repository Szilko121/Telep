import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";

// Mivel a modern Vite projektek "module" típusúak, a __dirname nem létezik alapból.
// Így hozzuk létre manuálisan, hogy működjön az alias feloldás:
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    // A 'true' érték engedélyezi a hálózati elérést (0.0.0.0), 
    // így telefonról is meg tudod nyitni a dev szervert (pl. http://192.168.x.x:8080)
    host: true, 
    port: 8080,
  },
  // FONTOS: A base: './' kell az Electronhoz és Capacitorhoz (Android),
  // hogy relatív útvonalon találja meg a fájlokat.
  base: "./",
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Android buildnél néha hasznos, ha nem darabolja túl apróra a fájlokat
    chunkSizeWarningLimit: 1000, 
  }
});
