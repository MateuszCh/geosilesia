# GeoSilesia — front

Aplikacja Angular (SPA). Treść pochodzi z CMS-a przez API serwera z katalogu nadrzędnego
(`../app.js`, Express + MongoDB); front nie ma własnych tras — każdy adres to strona
z kolekcji `pages`.

## Uruchomienie w dewie

Backend i front chodzą osobno; `proxy.conf.json` przekierowuje `/api` i `/uploads`
na port 3000.

```bash
cd ..      && node app.js     # backend, :3000
cd front   && npm start       # ng serve z proxy, :4200
```

## Build i wdrożenie

```bash
npm ci && npm run build       # → dist/geosilesia/browser
```

**Deploy musi uruchamiać ten build** — serwer serwuje statyk i wstrzykuje meta SEO
prosto z `dist/geosilesia/browser`, a katalog jest w `.gitignore`.

## Czego nie ruszać bez sprawdzenia

- **Markery `<!--seo:start-->` / `<!--seo:end-->` w `src/index.html`** — serwer podmienia
  blok między nimi na meta konkretnej strony. Ich brak oznacza serwis bez SEO, i to bez
  żadnego błędu.
- **`../shared/seo-meta.js`** — wspólny z serwerem; obie strony muszą wyliczać tytuł
  i opis identycznie. Typy w `../shared/seo-meta.d.ts`.
- **`navigationRequestStrategy: "freshness"` w `ngsw-config.json`** — bez tego service
  worker oddawałby nawigacje z cache'owanego `index.html`, czyli każda strona dostałaby
  generyczne meta zamiast wstrzykniętych przez serwer.
- **Schemat IndexedDB w `src/app/core/idb.service.ts`** — baza `geosilesia` v1, store
  `pages` (klucz `pageUrl`) i `posts` (klucz `id`, indeks `type`). Użytkownicy mają te
  bazy na dyskach; zmiana wersji kasuje im dane offline.
