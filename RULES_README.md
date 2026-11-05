# Patch – Firestore szabályok + indexek + üzenetek javítás

**Mi változott:**
- `firestore.rules`: szabályok a jóváhagyós „Munkák” és a „Notifications” funkcióhoz
- `firestore.indexes.json`: javasolt összetett indexek
- `src/pages/UzenetekPage.tsx`: path fix (`...items` ➜ `items`)

**Telepítés:**
1) Másold a fájlokat a projektbe (felülírva a meglévőket, ha vannak):  
   - `firestore.rules` a gyökérbe  
   - `firestore.indexes.json` a gyökérbe  
   - `src/pages/UzenetekPage.tsx` felülírás

2) Deploy:
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

**Jogosultságok összefoglaló:**
- Munkák olvasása: tulaj vagy aznapi műszakos (users.{uid}.muszakosId == muszakBeosztasDays.{dateISO}.operator.id) vagy admin/„főnök”
- Létrehozás: csak saját UID-dal, `status="pending"`
- Jóváhagyás: admin/„főnök” vagy aznapi műszakos teheti `pending` ➜ `approved|rejected`
- Értesítések: csak a címzett olvashat/törölhet/állíthat „read”-et (admin is), létrehozni bárki bejelentkezett

**Megjegyzés:**
Az admin/„főnök” szerepkört a `users/{authUid}.role` mező alapján ellenőrizzük. Gondoskodj róla, hogy ez a dokumentum létezzen, és legyen benne `role: "admin"` vagy `role: "főnök"`. A műszakos jogosultság a `users/{authUid}.muszakosId` és a `turnusok/{turnusId}/muszakBeosztasDays/{dateISO}.operator.id` egyezése alapján történik.
