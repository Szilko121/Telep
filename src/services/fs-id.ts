// src/services/fs-id.ts
/** Név -> Firestore-barát ID (ékezetek le, kisbetű, nem alfanumerikus helyett '-') */
export function toId(input: string): string {
  if (!input) return "";
  return input
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // ékezetek le
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")                       // nem alnum -> '-'
    .replace(/^-+|-+$/g, "");                          // szélső '-' le
}

/** Több mezőből összerakott ID: pl. date + ól -> '2025-10-18_1a' */
export function composeId(parts: Array<string | number | undefined | null>): string {
  return parts
    .filter((p) => p !== undefined && p !== null && String(p).length > 0)
    .map((p) => toId(String(p)))
    .filter((p) => p.length > 0)
    .join("_");
}
