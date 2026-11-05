// src/services/saveWithFixedId.ts
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toId, composeId } from "./fs-id";

type AnyObj = Record<string, any>;

function inferId(collection: string, data: AnyObj): string {
  const c = (collection || "").toLowerCase();

  const firstNonEmpty = (...vals: any[]) => {
    for (const v of vals) {
      if (v !== undefined && v !== null && String(v).trim().length > 0) return v;
    }
    return "";
  };

  // MŰSZAKOSOK / dolgozók
  if (c.includes("muszak")) {
    const name = firstNonEmpty(data?.nev, data?.name, data?.employee, data?.operator, data?.displayName);
    if (name) return toId(String(name));
  }

  // CSOPORTOK
  if (c.includes("csoport")) {
    const name = firstNonEmpty(data?.nev, data?.name, data?.title, data?.label);
    if (name) return toId(String(name));
  }

  // ÓLAK / istállók
  if (c.includes("olak") || c.includes("istall") || c.includes("istáll") || c.includes("barn")) {
    const code = firstNonEmpty(data?.kod, data?.code, data?.nev, data?.name, data?.flock, data?.barn);
    if (code) return toId(String(code));
  }

  // TURNUSOK
  if (c.includes("turnus")) {
    const start = firstNonEmpty(data?.startDate, data?.start, data?.dateStart, data?.kezdet, data?.datumKezdet);
    const site = firstNonEmpty(data?.site, data?.farm, data?.telep, data?.location);
    if (start || site) return composeId([start, site]);
  }

  // NAPI LOG (elhullás)
  if (c.includes("daily") || c.includes("log")) {
    const date = firstNonEmpty(data?.date, data?.day, data?.datum);
    const flock = firstNonEmpty(data?.flock, data?.barn, data?.ol, data?.ol_kod, data?.flockCode);
    if (date || flock) return composeId([date, flock]);
  }

  // SÚLYMÉRÉS
  if (c.includes("weight") || c.includes("suly") || c.includes("súly")) {
    const date = firstNonEmpty(data?.date, data?.day, data?.datum);
    const flock = firstNonEmpty(data?.flock, data?.barn, data?.ol);
    const idx = firstNonEmpty(data?.index, data?.seq, data?.sampleIndex, data?.mintaszam);
    return composeId([date, flock, idx]);
  }

  // KÖZMŰÓRÁK
  if (c.includes("meter") || c.includes("ora") || c.includes("óra")) {
    const date = firstNonEmpty(data?.date, data?.datum);
    const type = firstNonEmpty(data?.type, data?.meterType, data?.tipus);
    const place = firstNonEmpty(data?.place, data?.flock, data?.barn, data?.site, data?.hely);
    return composeId([date, type, place]);
  }

  // TIMESHEETS / beosztás / shift
  if (c.includes("timesheet") || c.includes("beoszt") || c.includes("shift")) {
    const date = firstNonEmpty(data?.date, data?.datum);
    const who = firstNonEmpty(data?.employee, data?.operator, data?.nev, data?.name);
    return composeId([date, who]);
  }

  // TAKARMÁNY
  if (c.includes("feed") || c.includes("takarm")) {
    const date = firstNonEmpty(data?.date, data?.datum);
    const flock = firstNonEmpty(data?.flock, data?.barn, data?.ol);
    const feedType = firstNonEmpty(data?.feedType, data?.type, data?.takarmanyTipus);
    return composeId([date, flock, feedType]);
  }

  // Általános fallback
  if (typeof data?.id === "string" && data.id.trim().length > 0) return toId(data.id);
  if (typeof data?.nev === "string" && data.nev.trim().length > 0) return toId(data.nev);
  if (typeof data?.name === "string" && data.name.trim().length > 0) return toId(data.name);

  // Végső fallback: dátum + kategória
  const date = firstNonEmpty(data?.date, data?.day, data?.datum);
  const cat = firstNonEmpty(
    data?.type, data?.kind, data?.category, data?.flock, data?.barn, data?.code, data?.kod
  );
  if (date || cat) return composeId([date, cat]);

  throw new Error(
    `Nem tudtam ID-t képezni a(z) '${collection}' kollekcióhoz. ` +
    `Adj meg kézzel (data.id) vagy bővítsd az inferId szabályt.`
  );
}

export async function saveWithFixedId(collectionName: string, data: AnyObj, merge: boolean = true) {
  const id = inferId(collectionName, data);
  const ref = doc(db, collectionName, id);
  await setDoc(ref, { ...data, id }, { merge });
  return { id };
}
