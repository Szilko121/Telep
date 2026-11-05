// src/data/chickenTemperatures.ts

/**
 * Napi szintû hõmérséklet görbe (Ross/Cobb standardok alapján közelítve).
 * Kulcs: nap, Érték: °C
 */
const tempCurve: Record<number, number> = {
  0: 34.0, 1: 34.0, 2: 33.0, 3: 33.0, 
  4: 32.0, 5: 32.0, 6: 31.0, 7: 30.0,
  8: 29.5, 9: 29.5, 10: 29.0, 11: 29.0, 
  12: 28.5, 13: 28.5, 14: 28.0, 15: 27.5,
  16: 27.5, 17: 27.0, 18: 27.0, 19: 26.5, 
  20: 26.5, 21: 26.0, 22: 25.5, 23: 25.5, 
  24: 25.0, 25: 24.5, 26: 24.5, 27: 24.0, 
  28: 23.5, 29: 23.5, 30: 23.0, 31: 22.5, 
  32: 22.5, 33: 22.0, 34: 21.5, 35: 21.5,
  // 36. naptól a vágásig (56+) tartjuk a 20-21 fokot
};

/**
 * Visszaadja az ideális belsõ hõmérsékletet a csirkék kora (nap) alapján.
 * @param day A csirkék életkora napokban
 * @returns Az ideális hõmérséklet °C-ban
 */
export function getIdealTemp(day: number): number {
  // Ha még nem indult el (negatív vagy 0), akkor fogadó hõmérséklet
  if (day <= 0) return 34.0;
  
  // Ha van pontos adat a táblázatban
  if (day in tempCurve) {
    return tempCurve[day];
  }

  // 35 nap felett (pl. 56-ig) tartjuk a 20-21 fokot
  if (day > 35) return 20.5;

  return 20.0;
}