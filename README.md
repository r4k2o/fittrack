# Fittrack

A private, local-first fitness logbook for the iPhone: food, training and body weight. It is a web app (PWA) installed from Safari with **Add to Home Screen**. Every record stays in IndexedDB on the phone; the only copy elsewhere is a backup file you export. It costs €0 to build and run, needs no Mac and no Apple developer account, and works offline after the first load.

**Status: phase 1 (MVP), daily logging.** Phases 2–4 follow the roadmap below; each phase leaves a working app.

## What phase 1 does

| Area | What is built |
| --- | --- |
| Install and safety | Installs from Safari; works offline (service worker caches the app, the barcode decoder and the exercise library); asks for persistent storage; backup reminder on Today once the last backup is 7 days old |
| Onboarding | Four screens: install and welcome (disclaimer, 18-or-older tick), about you, goal and activity, targets |
| Targets | Mifflin-St Jeor (or Katch-McArdle with a body-fat reading) × activity factor, shifted for the goal; protein, fat, carbohydrate as the remainder. "Why these numbers" shows the working with sources; every value has a slider, and values set by hand survive recalculation. Warnings below the resting estimate and below 3 g/kg of carbohydrate; no deficit target under 18 |
| Food diary | Four meals, date switcher, day totals against the target valid that day, edit or delete with Undo, copy a meal to another day |
| Adding food | Repeat a whole earlier meal in one tap; recent, frequent and my foods; typo-tolerant search (MiniSearch, offline) over the imported food list and everything scanned or created; quick add; add from label; one portion screen with grams, named servings and last time's portion |
| Barcodes | Camera with a framing box (ZXing in WebAssembly, bundled so it works offline), torch where supported, still photo and typed code as fallbacks; local foods first, then Open Food Facts; confirmation card with a 4P + 4C + 9F sanity check |
| Workouts | Start empty or from a routine; 158-exercise library plus your own; each set prefilled from last time, with the load step added once every set reached the top of its rep range; tick to log; rest timer starts on the tick and beeps while the app is open; the screen stays awake; summary with volume and estimated-1RM records; save as routine |
| Progress | Body weight: daily readings, exponentially smoothed trend, weekly averages (only with 4 of 7 days), weekly rate against the goal's band, warning when faster than 1% down or 0.5% up per week |
| Backup | One `.zip` (manifest + one JSON file per store, photos optional) through the iOS share sheet; restore validates every row with Zod, previews adds/updates/removals per store, then Merge (newer `updatedAt` wins) or Replace, in one transaction. CSV export of diary, sets, cardio and metrics |
| Device check | Under More: installed mode, persistent storage, wake lock, a barcode with its Open Food Facts lookup, and a backup saved and read back. Run it before entering real data and after each iOS update |

## Run it locally

Node 22 LTS (Vite 8 needs 20.19+ or 22.12+).

```bash
npm install
npm run dev        # http://localhost:5173/fittrack/
npm test           # schema, maths, backup, Open Food Facts mapping, import, search, barcode image
npm run build      # type-check, then dist/ with sw.js
npm run preview    # serve dist/ at http://localhost:4173/fittrack/
```

`npm install` reports a few moderate audit advisories in build tooling under vite-plugin-pwa; none of that code ships in the app. Do not run `npm audit fix --force`, which would downgrade the plugin.

Opened from the phone, the dev server's `http://192.168…` address is not a secure context: the live camera, installation and offline mode only work on the deployed HTTPS address.

## Deploy and install on the iPhone

1. In the repository on GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Merge to `main`. [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs the tests, builds and publishes to `https://r4k2o.github.io/fittrack/`. Every push to `main` redeploys; the app picks up the new version at its next launch.
3. On the iPhone, open that address in Safari, tap **Share → Add to Home Screen** (on iOS 26 and later, leave "Open as Web App" on).
4. Open the app from its icon and do the onboarding there: the installed app has its own storage, separate from Safari's.
5. Switch on airplane mode, reopen the app, then run **More → Device check**.

`base` in `vite.config.ts` must equal the repository name. The database belongs to the address: a new repository name or host means an empty app, so export a backup before moving. GitHub Pages on the free plan needs a public repository; Cloudflare Pages accepts a private one (set `base: '/'` there).

## Food list

Search covers everything you scan or add. For generic foods, import a food table once under **More → Food list**:

- **BLS 4.0**, Germany's national food table (7,140 foods, free from [blsdb.de](https://blsdb.de)). Open the download in Numbers or Excel, export as CSV, and pick the file in the app. Read its licence before publishing the converted file anywhere.
- **USDA FoodData Central** (English, public domain) works the same way.

The importer reads CSV (semicolon, comma or tab; decimal commas are fine) or JSON. It guesses the columns from English and German headers and common nutrient codes, shows the guess with a preview, and lets you change any column before importing. It needs a name, energy (kcal or kJ), protein, carbohydrate and fat per 100 g; fibre, sugar, saturated fat and salt (or sodium) are used when present. Re-importing keeps the links from your diary and recent foods.

The imported list is part of the backup, so a restore on a new phone does not need the CSV again. (The plan left the built-in list out of backups because it assumed the list would ship with the app; here it is imported by hand, so the backup carries it.)

## Exercise library

`src/data/exercises.json` holds 158 common lifts from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain) plus a few additions, tagged with movement slot, normalised equipment and the joints they load. To regenerate it:

```bash
curl -L -o /tmp/exercises.json https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
npm run exercises -- /tmp/exercises.json
```

Bump `LIBRARY_VERSION` in `scripts/build-exercises.mjs` when the output changes; installed apps re-seed on their next launch and keep any load step you changed.

## Code layout

| Path | Holds |
| --- | --- |
| `src/db.ts` | The 18 IndexedDB stores (Dexie), row types and id/timestamp helpers |
| `src/lib/` | Rules as plain, tested functions: nutrition targets, trends and e1RM, macros, progression, backup format, CSV, food search and import, barcode checks |
| `src/store/` | Database operations: diary, foods, metrics, profile and targets, training, backup, settings, library seeding |
| `src/adapters/` | Thin modules for the outside world: Open Food Facts, the barcode decoder, the share sheet |
| `src/screens/` | The interface, one folder per tab |
| `src/ui/` | Building blocks, icons and the Undo toast |

Data rules: ids are UUIDs (library exercises and imported foods use stable ids so references survive a restore); every row carries `createdAt` and `updatedAt`; days are local `YYYY-MM-DD` strings and timestamps UTC; a diary entry stores its own macro snapshot; targets are never overwritten but superseded by a row with a new `effectiveFrom`; `metrics` is unique on type, date and source.

## Roadmap

| Phase | Content | Gate before the next phase |
| --- | --- | --- |
| **1 · Daily logging** (this release) | Install and backup, onboarding with targets, food diary with search and barcodes, workout log with rest timer | 14 days of your own logging; a repeated meal in 3 taps or fewer; a scanned product logged in about 5 seconds; a backup restores |
| 2 · Plans and recipes | Plan generator from the 7-question questionnaire, plan editor with weekly-volume bars, recipes with cooked-weight yield, saved meals, cardio log | Generated plans pass the volume, spacing and time tests for every combination of answers; two weeks trained from one |
| 3 · Photo logging | API test page, meal photo to foods with grams via your own vision-API key, confirmation sheet, request counter | 20 meals weighed to know the error; confirming a photo is quicker than searching, or the feature is dropped |
| 4 · Health and trends | Apple Health import from a Shortcut file (with undo), trend charts and weekly review, progress photos, targets corrected from your own intake and weight trend | An import matches the Health app and a second import adds nothing; the expenditure estimate appears after 14 logged days |

The maths for phase 4's expenditure estimate is already in `src/lib/trends.ts` and tested.

## Credits

Product data from [Open Food Facts](https://world.openfoodfacts.org), available under the Open Database License. Exercise library seeded from free-exercise-db (Unlicense). Barcode decoding with ZXing compiled to WebAssembly.

## Disclaimer

Fittrack is a personal logbook, not a medical device. Its calorie, macro and training figures are estimates from published formulas and do not replace advice from a doctor, dietitian or physiotherapist. Do not rely on them if you are under 18, pregnant or breastfeeding, or have a medical condition or a history of disordered eating. Stop any exercise that causes pain. Food values from photos, barcodes and food tables can be wrong, so check them before logging.
