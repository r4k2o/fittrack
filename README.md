# Fittrack

A private, local-first fitness app for the iPhone: food, training, body weight, sleep and progress photos. It is a web app (PWA) installed from Safari with **Add to Home Screen**. Every record stays in IndexedDB on the phone; the only copy elsewhere is a backup file you export. It costs €0 to build and run, needs no Mac and no Apple developer account, and works offline after the first load.

**Live at <https://r4k2o.github.io/fittrack/>.** Open it in Safari on the iPhone, tap **Share → Add to Home Screen**, and start the app from its icon.

**Status: all four phases of the plan are built.** Each phase ends with a gate, a check only you can run on your phone with your own data (see [Gates](#gates)).

## What it does

| Area | What is built |
| --- | --- |
| Install and safety | Installs from Safari; works offline (the service worker caches the app, the barcode decoder and the exercise library); asks for persistent storage; backup reminder on Today once the last backup is 7 days old |
| Onboarding | Seven screens: install and welcome (disclaimer, 18-or-older tick), about you, goal and activity, targets, training questions (skippable), plan preview, optional extras |
| Targets | Mifflin-St Jeor (or Katch-McArdle with a body-fat reading) × activity factor, shifted for the goal; protein, fat, carbohydrate as the remainder. "Why these numbers" shows the working with sources; every value has a slider, and values set by hand survive recalculation. Warnings below the resting estimate and below 3 g/kg of carbohydrate; no deficit target under 18 |
| Targets from your data | After 14 days with at least 12 logged, expenditure = average intake − trend weight change × 7,700 kcal per kg ÷ days. When it differs from the maintenance in use by more than 5%, new targets are proposed on Today and under Progress → Food; you accept or ignore them |
| Food diary | Four meals, week strip, day totals against the target valid that day, swipe a row to copy or delete (both undoable), copy a meal to another day, save a meal to log it again in one tap |
| Adding food | Saved meals and earlier meals in one tap; recent, frequent, your foods and recipes; one tap on **+** logs a food's usual portion; typo-tolerant offline search (MiniSearch) over the imported food list, your foods and recipes; barcode; photo; quick add; add from label |
| Barcodes | Camera with a framing box (ZXing in WebAssembly, bundled so it works offline), torch where supported, still photo and typed code as fallbacks; local foods first, then Open Food Facts; a 4P + 4C + 9F sanity check |
| Recipes | Ingredients with raw weights; the cooked weight gives per-100 g values for the finished dish; servings divide it; logged by serving or by grams |
| Photo logging | Your own key for Gemini, OpenRouter or Mistral, stored only on the phone. The photo is downscaled to about 1,024 px; the model lists foods with grams and a confidence; each is matched to your food list, which supplies the calories. A confirmation screen with gram steppers marks low-confidence items "check"; nothing is logged until you confirm, and entries stay marked as photo-based. Connection test, daily limit with today's count, and how far your grams were from the model's |
| Training plan | Seven questions (days, minutes, experience, equipment, injuries, goal, up to two priority muscles) give a split, weekdays 48 hours apart and a prescription per exercise. Weekly hard sets of 10, 12 or 14 by experience (10 on a cut, +3 for a priority), never above 20, with assisting muscles counted half. The time budget (3 min per compound set, 2 per isolation set, 5 of warm-up) is met with supersets first, then stated cuts. Exercises fit the equipment and leave out flagged joints |
| Plan editor | Rename, reorder and schedule days; swap an exercise (same movement first); change sets, reps, reserve and rest; pair supersets; add or remove sessions; undo. Bars per muscle against the 10–20 band, and warnings for sessions under 48 hours apart or over time, follow every edit. Optional "Ask AI": the plan explained, or a request ("a week in a hotel") turned into new answers that the rule engine builds and checks |
| Workouts | Start the plan's day, a routine or an empty workout. Sets prefilled from last time with the plan's set count, rep range and rest; the load step is added once every set reached the top of the range. Tick to log; the rest timer starts on the tick; the screen stays awake. Three sessions without progress suggest 10% less or a swap; after six weeks a lighter week (half the sets) is offered, never forced. Summary with volume and estimated-1RM records |
| Cardio | Type, duration (the only required field), date, distance with pace or speed, effort 1–10, heart rate, calories from the watch or MET × weight × hours. Weekly minutes by intensity against the WHO's 150; burned calories can be added to the food budget (off by default) |
| Apple Health | A Shortcut writes plain lines (steps, weight, body fat, sleep segments, workouts); the import previews new, updated and unchanged values, writes them in one transaction, and the latest import can be undone. The same file twice adds nothing. On a computer, the same screen streams Apple's full export.zip down to that format for a one-time backfill |
| Progress | Segments for body (weight trend and rate against the goal's band, body fat as weekly averages), training (sets per muscle, weekly best estimated 1RM per lift, cardio minutes), food (share of logged days on target, weekly averages, expenditure), sleep (7-day averages, the score labelled typed-in or computed, weekly steps) and photos. Compare puts two series on one time axis as stacked charts with a shared crosshair |
| Weekly review | Each Monday on Today, and any week under Progress → Review: weight change against the band, adherence, sets per muscle, sleep, steps, cardio, and at most one suggestion, such as a calorie change you can apply in one tap |
| Progress photos | Capture guide; live camera with a 35% ghost of the last photo of the pose and a 10-second countdown (system camera as fallback); 1,600 px JPEG plus thumbnail filed by ISO week, pose and that day's weight; a retake replaces the week's shot unless starred; side-by-side and slider comparison with "first against latest" and "four weeks apart". Never sent anywhere |
| Backup | One `.zip` (manifest + one JSON file per store, photos optional) through the iOS share sheet; restore validates every row with Zod, previews adds/updates/removals per store, then Merge (newer `updatedAt` wins) or Replace, in one transaction. The API key never goes into a backup. CSV export of diary, sets, cardio and metrics |
| Device check | Under More: installed mode, persistent storage, wake lock, a barcode with its Open Food Facts lookup, and a backup saved and read back. Run it before entering real data and after each iOS update |

## Run it locally

Node 22 LTS (Vite 8 needs 20.19+ or 22.12+).

```bash
npm install
npm run dev        # http://localhost:5173/fittrack/
npm test           # 123 tests: schema, maths, plan generator, imports, backup, AI parsing
npm run build      # type-check, then dist/ with sw.js
npm run preview    # serve dist/ at http://localhost:4173/fittrack/
```

`npm install` reports a few moderate audit advisories in build tooling under vite-plugin-pwa; none of that code ships in the app. Do not run `npm audit fix --force`, which would downgrade the plugin.

Opened from the phone, the dev server's `http://192.168…` address is not a secure context: the live camera, installation and offline mode only work on the deployed HTTPS address.

## Deploy and install on the iPhone

Deployment is automatic. Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): it installs, runs the tests, builds, and force-pushes `dist/` (with `.nojekyll`) to the `gh-pages` branch, which GitHub Pages serves at <https://r4k2o.github.io/fittrack/>. The installed app picks up a new version the next time it starts.

1. On the iPhone, open <https://r4k2o.github.io/fittrack/> in Safari, tap **Share → Add to Home Screen** (on iOS 26 and later, leave "Open as Web App" on).
2. Open the app from its icon and do the onboarding there: the installed app has its own storage, separate from Safari's.
3. Switch on airplane mode, reopen the app, then run **More → Device check**.

`base` in `vite.config.ts` must equal the repository name. The database belongs to the address: a new repository name or host means an empty app, so export a backup before moving. GitHub Pages on the free plan needs a public repository; Cloudflare Pages accepts a private one (set `base: '/'` there).

## Apple Health import

HealthKit is closed to web apps, so Health data arrives as a file. Build the Shortcut once:

1. In Shortcuts, add **Find Health Samples**: type Steps, start date in the last 14 days, **Group by Day** (daily totals; avoids counting iPhone and Watch twice).
2. Add **Repeat with Each**; inside, **Get Details of Health Sample** gives the date and value, and a **Text** action writes one line such as `steps;2026-11-16;8432`. Format dates as ISO 8601.
3. Repeat for Weight, Body Fat Percentage and Sleep, and optionally Workouts.
4. Combine the text and **Save File** under a fixed name in iCloud Drive, overwriting the previous file.
5. In the app, **More → Apple Health → Choose file**. Compare the first import's step totals with the Health app.

```text
steps;2026-11-16;8432
weight;2026-11-16T07:02;80.4
bodyfat;2026-11-16;0.182
sleep;2026-11-15T23:41;2026-11-16T07:02;Core
workout;2026-11-16T18:00;2026-11-16T18:45;Running;420;8.1
sleepscore;2026-11-16;84
```

The parser accepts `;`, `,` or tabs, ISO or day-first dates, decimal commas, units after numbers, kg or lb, body fat as a fraction or a percentage, and sleep stages in English or German. It keeps the first weight and the latest body-fat reading of a day, the largest per-source step total, and files sleep under the wake-up date with overlapping segments merged. Strength workouts are left out (log those in Train). Apple's sleep score has no API, so the app computes its own (duration 60, bedtime regularity 20, interruptions 20 points) and charts say which score they show.

For your whole history, export everything from the Health app (your picture → **Export All Health Data**), open **More → Apple Health** on a computer and pick the export.zip: it is read in the browser, never uploaded, and reduced to the line format for the phone to import.

## Photo logging

Optional, and the one feature that cannot be both free and guaranteed. Under **More → Photo logging**, pick a provider, paste a key and run **Test connection**:

| Provider | Free allowance | Catch |
| --- | --- | --- |
| Gemini (default, `gemini-flash-lite-latest`) | About 15 requests a minute and 500 a day, no card (October 2026 readings) | Google publishes no fixed numbers. Its terms ask for the paid tier for apps used in the EEA: about US$0.001 a photo, prepaid from US$5 |
| OpenRouter | 50 a day on free models (1,000 after buying US$10 of credit once) | The free vision models change; set one in the model field |
| Mistral (`mistral-small-latest`) | Free Experiment plan with phone verification | Requests may be used for training; limits not published |

Create the key without a payment method attached. It is stored only on the phone, never in the repository or a backup. Only meal photos are sent; on a free tier treat them as readable by the provider. In a 2025 study, models were off by about 40% or more on portion weight, so the app takes calories from your food list, shows a gram stepper per item, and tracks how far your confirmed grams are from the model's guesses.

## Food list

Search covers everything you scan or add. For generic foods, import a food table once under **More → Food list**:

- **BLS 4.0**, Germany's national food table (7,140 foods, free from [blsdb.de](https://blsdb.de)). Open the download in Numbers or Excel, export as CSV, and pick the file in the app. Read its licence before publishing the converted file anywhere.
- **USDA FoodData Central** (English, public domain) works the same way.

The importer reads CSV (semicolon, comma or tab; decimal commas are fine) or JSON, guesses the columns from English and German headers and common nutrient codes, shows the guess with a preview, and lets you change any column. It needs a name, energy (kcal or kJ), protein, carbohydrate and fat per 100 g; fibre, sugar, saturated fat and salt (or sodium) are used when present. The imported list is part of the backup.

## Exercise library

`src/data/exercises.json` (version 2) holds 181 lifts from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain) plus additions, including band and bodyweight lifts so that every equipment choice fills every slot. Each is tagged with its movement slot, normalised equipment and the joints it loads; a few assisting muscles are corrected where the source's list would distort the weekly-set count. To regenerate it:

```bash
curl -L -o /tmp/exercises.json https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
npm run exercises -- /tmp/exercises.json
```

Bump `LIBRARY_VERSION` in `scripts/build-exercises.mjs` when the output changes; installed apps re-seed on their next launch and keep any load step you changed.

## Design

The interface follows the conventions of a current iOS app, built with plain CSS and Tailwind tokens in `src/index.css`: light and dark themes following the system; a volt-green brand with a tone per area (food orange, training violet, body cyan); glass only for floating chrome; large titles that hand over to a compact bar; one hero number per screen; inset grouped lists; sheets that close on a drag down. Charts follow one set of rules: unit and averaging window in every title, a legend for two or more series, hairline grids, a shared crosshair, values in text colours, status with an icon and a word, and no dual axes. Tap targets are at least 44 points, fields use 17 px text so iOS does not zoom, and every animation honours "Reduce Motion".

## Code layout

| Path | Holds |
| --- | --- |
| `src/db.ts` | The 18 IndexedDB stores (Dexie), row types and id/timestamp helpers |
| `src/lib/` | Rules as plain, tested functions: nutrition targets, trends, macros, progression, the plan generator (`planner.ts`) and volume model (`volume.ts`), recipes, cardio METs, Health parsing (`health.ts`) and the Apple export reducer, progress and weekly review maths, AI request building and reply parsing, backup format, CSV, food search and import, barcode checks |
| `src/store/` | Database operations: diary, foods, recipes and saved meals, metrics, profile and targets, plans, training, cardio, Health import with undo, progress queries, photos, backup, settings, library seeding |
| `src/adapters/` | The outside world: Open Food Facts, the barcode decoder, the camera, the vision provider, the share sheet |
| `src/screens/` | The interface, one folder per tab; `train/plan/` holds the questionnaire, preview and editor; `progress/` the segments, charts, compare and photos; `shared/` pieces several tabs use |
| `src/ui/` | Building blocks (`kit.tsx`), icons, motion helpers and the Undo toast |

Data rules: ids are UUIDs (library exercises and imported foods use stable ids so references survive a restore); every row carries `createdAt` and `updatedAt`; days are local `YYYY-MM-DD` strings and timestamps UTC; a diary entry stores its own macro snapshot; targets are never overwritten but superseded by a row with a new `effectiveFrom`; `metrics` is unique on type, date and source.

## Gates

The plan's stop-or-go checks. The code side is in place and tested; what remains needs your phone and your data:

| Phase | Gate | Where it stands |
| --- | --- | --- |
| 1 · Daily logging | 14 days of your own logging; a repeated meal in 3 taps or fewer; a scanned product logged in about 5 seconds; a backup restores | One-tap repeat and backup restore pass in automated tests; the timings and the 14 days are yours to measure |
| 2 · Plans and recipes | Generated plans pass the volume, spacing and time tests for every combination of answers; two weeks trained from one | The generator test covers all 7,875 combinations (plus priority muscles) and passes; the two weeks are yours |
| 3 · Photo logging | 20 meals weighed to know the error; confirming a photo is quicker than searching, or the feature is dropped | The accuracy figure under More → Photo logging fills in as you confirm meals |
| 4 · Health and trends | An import matches the Health app and a second import adds nothing; the expenditure estimate appears after 14 logged days | Re-import and undo pass in automated tests; compare the first import with the Health app yourself |

## Credits

Product data from [Open Food Facts](https://world.openfoodfacts.org), available under the Open Database License. Exercise library seeded from free-exercise-db (Unlicense). Barcode decoding with ZXing compiled to WebAssembly. MET values from the Compendium of Physical Activities.

## Disclaimer

Fittrack is a personal logbook, not a medical device. Its calorie, macro and training figures are estimates from published formulas and do not replace advice from a doctor, dietitian or physiotherapist. Do not rely on them if you are under 18, pregnant or breastfeeding, or have a medical condition or a history of disordered eating. Stop any exercise that causes pain. Food values from photos, barcodes and food tables can be wrong, so check them before logging.
