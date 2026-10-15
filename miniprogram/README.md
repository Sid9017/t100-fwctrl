# KCALACK Mini Program

Native WeChat Mini Program, AppID `wx30eebce62206e490`.

## Run

1. Run `npm install`, then `npm run build:miniprogram`.
2. Import the repository root into WeChat Devtools. `project.config.json` selects `miniprogram/` and the AppID.
3. Compile and use Preview in phone WeChat, or use the native Mac BLE bridge below to debug without a phone. The built-in simulator BLE records alone do not confirm nearby presence.
4. Allow Bluetooth, wake the T100 and tap **+** beside **Device list**. Select the device to connect.
5. Configure `https://t100-ctrl.netlify.app` as a **request legal domain** for the AppID before using online OAD. All three OAD resources use `wx.request` with ArrayBuffer responses; no downloadFile domain or private publishing credential is needed. If WeChat does not accept this domain for the account, host/proxy the signed API on an eligible domain and change `OTA_ORIGIN` in `src/miniprogram/firmware.js`. Keep domain validation enabled.

The Mini Program is the primary client. The web service continues providing signed OAD metadata, binary and manifest endpoints. The existing web sources are retained as the protocol/behavior reference.

## Online food analysis

The Mini Program connects directly to `https://skcale-api.haivivi.cn`; Netlify is not an analysis proxy. Configure this origin and the actual presigned upload origin as request legal domains. Keep domain validation enabled. Results reuse the existing PowerSync HTTP stream; no new result GET endpoint is required.

WeChat code login is implemented in [skcale-server PR #2](https://github.com/h2vivi/skcale-server/pull/2), with deployment still unverified. Until deployed/configured, real analysis reports a sign-in error; only isolated preview mode uses mock data. Never put the WeChat AppSecret in the Mini Program. See [online service integration](../docs/online-services.md) for contracts and verification limits.

## Mac Bluetooth debugging (no phone)

1. Install Python 3 and `python3 -m pip install -r scripts/desktop-ble/requirements.txt` (use a virtual environment if required).
2. Build with `npm run build:miniprogram`, then keep `npm run dev:ble` running in a terminal.
3. For this local simulator session, set `setting.urlCheck` to `false` in the ignored `project.private.config.json` so `wx.request` can reach localhost. Restore it to `true` before validating production networking. Keep the shared `project.config.json` unchanged.
4. Compile in Devtools, then **+ → Nearby devices → Add & connect**. This scans the Mac's real radio, not simulator records. Allow Bluetooth for the terminal/Python host if macOS asks.
5. Use the normal device controls. An already-bound scale still requires its existing auth backup imported into the simulator's separate storage. The bridge never extracts credentials or rebinds a device.

The bridge listens only on `127.0.0.1:8768`, requires a fresh per-process token, and exposes only BLE operations. Its config is generated under ignored `miniprogram/lib/`; never commit it. Only a Devtools runtime can select this adapter. Phone previews always use native WeChat BLE. Stop with Ctrl+C; restart the bridge and recompile to reconnect. Recompilation replaces the old bridge session and releases its connection. If the simulator vanishes, a watchdog disconnects after 15 seconds without requests. The local transport adds latency; validate final OAD timing on a phone.

## Screens and feature parity

| Screen | Native interaction | Shared implementation |
| --- | --- | --- |
| Devices | Compact saved-device rows, green/grey presence dot, last connection time, + discovery sheet | wx BLE discovery and verified FEE0 connection |
| Device | Original monochrome chassis, grey shadow/rear fade and live display | Same firmware WASM, FEE5/FEE1 snapshots |
| Device | Transparent mode and g/oz wheels, tare and scale navigation | Same authenticated FEE0 builders |
| Device | Espresso/PourOver base mass, ratio, computed targets and live stage/progress | Same recipe/profile wire format; recipe inputs are in g |
| Device | KCal container set/clear with confirmed/pending feedback | Secure UUID and matching FEE1 v3 UUID + weight echo; physical reset clears state |
| Device | Remaining, target and TDEE countdown inputs | Same target/remaining/navigation sequence and committed WASM values |
| Device | Notify text, color presets/custom hex | Native Canvas 24×H gray rendering, same BEGIN/CHUNK/COMMIT upload and PWM fade |
| Device | Three parallel food image wheels, kcal/weight/unit inputs and draggable rating dots | Same three-photo history upload; weight/unit remain local helper fields, as in the web UI |
| Settings | Bind + preset1 emotion, reset, factory reset, refresh/disconnect | Same verified binding token, emotion upload and acknowledged reset/reboot wait |
| Settings | Auth JSON file/paste import, local JSON export and explicit share action | Same atomic JSON/key/P-256 validation and named-device resolution |
| Firmware | Latest signed firmware by default, local BIN + manifest, collapsible version/uploaded/SHA256, progress | Same pinned publishing key, SHA256/ECDSA validation and ChunkX selective-repeat transfer; current version re-read before upgrade |
| Activity | Bounded action log with clear/hide | Shared upload/action progress |

Auth credentials use isolated WeChat local storage (`t100.mfg.auth.v1`). Device association uses `kcalack.t100.devices.v1`; only successful, verified connections are saved (one device maximum). Discovery alone never adds a device. The device list checks nearby broadcasts every 30 seconds while visible in the foreground. Only a fresh advertisement in the current phone scan produces a green nearby dot. A grey dot means no current scan evidence, not proof the device is powered off. Devices already connected elsewhere may stop advertising. The desktop bridge's cached/replayed entries are confined to diagnostic simulator records.

Imported credentials are validated before storage changes. Binding persists credentials before committing to the device, retaining them if subsequent emotion upload fails. Reset/factory remove only that device's auth after the command is acknowledged, then wait for firmware restart. Backups are written under the Mini Program's local user data path; **Share backup JSON** opens WeChat's user-controlled file-sharing flow.

The renderer follows real status by default. Unbound pairing retains the web renderer's explicitly labelled sample-identity preview, not a real binding QR token. Countdown and notification content from successful actions are passed into the same WASM remote-content functions. Content not reported by the device is not fabricated. Rendering pauses offscreen/background and is removed while native sheets are open to avoid Canvas overlap.

BLE reads resolve through `onBLECharacteristicValueChange`. Operations are serialized; timeout/disconnect rejects pending reads. Android requests MTU185; iOS uses the system MTU. FEE1 requires at least MTU39. Uploads use the actual negotiated MTU or a conservative MTU23 fallback, never the desktop MTU512 fallback. OAD reports success only after device COMMITTED confirmation. Unknown/same current firmware versions cannot start upgrading.

The mini build packages the exact web emotion and food assets, derives mode-title glyph images directly from firmware exports, bundles P-256/SHA256 verification, and removes only unsupported exported globals from the WASM copy. No signing private keys, AppSecret or publishing upload token are included.

## Verify

```sh
npm test
npm run build:miniprogram
npm run build
```

Before release, verify on a real phone: connection and permission failures; bind/reinstall emotion; import/export a real auth backup; all four profiles and g/oz; coffee targets; container UUID set/clear and physical reset; countdown/TDEE; notify color/text/fades; three food images/rating history; latest/local signed OAD, identical-version blocking and post-upgrade reconnect; reset/factory credential removal. Automated tests and desktop layout previews cannot prove device Flash/reboot behavior.


## KCALACK app flow

No login, phone-number collection, OpenID request or account service is used. Product text uses KCALACK; existing BLE UUIDs, manufacturer product ID, auth cache keys and signed firmware identifiers remain protocol-compatible.

Native routes replace the old horizontal swiper and pagination dots:

- `pages/index/index`: no disconnected chassis preview or dedicated Weigh action; the + adds a device, while the saved-device chip only displays connection status. The home shows today’s journal and recording; historical date selection lives in reports.
- `pages/plan/index`: birthday, body measurements, weekly weight-change goal and service-calculated nutrition plan. The API owns TDEE calculation; only daily target and supported macro overrides are editable. Profile restoration finishes before setup becomes available.
- `pages/devices/index`: device identity and cached/current firmware, a confirmed red Reset action, and OAD only when a published signed package differs from the known current version. OAD expands an inline transfer progress bar. Successful reset removes the local association after the device acknowledges it. Add device stays on Home.
- Today embeds `pairing/device/index`, an asynchronous subpackage component: pairing reveals it in normal document flow; the real Rive pitches straight from 45 degrees to overhead (no roll), then zooms 1.06×; the display fills 80% of the front window. The rear outline gradient moves with the geometry. Its final pose matches the static fallback and enlarged 320×80 WASM panel. The legacy `pairing/index` URL only redirects home.
- There is no standalone device screen. The home display continuously follows firmware status/readings/commits; its KCal container entry opens container settings. Device reset and published firmware upgrades live in My device. Hide/background pauses rendering without disconnecting BLE.
- `pages/record/index`: up to five circular dish slots. Capture opens the dish editor before showing the photo in the wheel. The detail screen displays returned calories, four nutrients, ingredients and meal advice; ingredient/description correction triggers server recalculation. Existing meal metadata is preserved, unsupported rating/numeric-nutrition edits are hidden. BLE still receives its compact three-image history format using the original UUID.
- `pages/reports/index`: Week and Month views, with a selected day’s nutrition summary and meals below both. Selecting a chart/calendar date keeps the current view; selecting a weekly bar does not move the seven-day chart range. Reports do not include a new-record entry. The week chart uses the recorded-day average; the monthly view uses a date picker. Missing days are excluded from averages; missing nutrients are marked partial; target/TDEE thresholds follow the plan active on that date.
- `pages/profile/index`: edit the personal plan, open device settings and view the saved-container count. Reports remain accessible from Home.

Authenticated journals use `kcalack.journal.v1:<user.id>` and plan drafts use `kcalack.plan-draft.v1:<user.id>`. Legacy unowned caches are retained without automatically assigning or uploading them to an account. Failed storage writes leave the in-memory journal unchanged; corrupt saved journals are not overwritten. A deleted meal retains per-device deletion requests until explicitly syncing to that device. A GATT write completion means **sent**, not a separate firmware persistence acknowledgement.

### Device barcode

`wx.scanCode` opens the camera on phones (`onlyFromCamera`, barcode/QR recognition). In Devtools it allows a local barcode image; real device discovery and connection still require the Mac BLE bridge. Current firmware shows Code128B containing **nine Base85 symbols** from the Z85 alphabet, encoded as one 57-bit integer, not Z85 block framing. Fields: schema bits 56..49 (`1`), compact public-key identity bits 48..8, shell ID bits 7..0. The decoder reconstructs the first six compressed P-256 public-key bytes and the exact `YD-<12 hex>` broadcast name, using two uint32 halves to avoid Number precision loss. A literal `YD-<12 hex>` label is also accepted. Invalid/unsupported codes do not start discovery.

After scanning, only a fresh exact-name broadcast can trigger connection; cached and unrelated records never auto-connect. Nearby discovery excludes the saved identity by both platform ID and name; manufacturer `0x6000/P` product ID rejects non-device peers when reported. A platform that omits manufacturer data can still match the existing YD identity name, followed by GATT service verification. Camera/real BLE discovery require phone verification.

### Devtools preview

Without a saved plan, first launch resets the route stack to the plan wizard. A real user cannot bypass it by Back or a deep link. Profile settings still allow later edits.

Use **Preview screens** in Devtools profile settings, or **Preview** in the plan wizard for isolated home, inline pairing, device information, record and report previews. `?preview=1` is accepted only when the actual platform is `devtools`; phone routes always use the real service. Preview has no BLE adapter, auth store or network client. Sample profile/journal data is held in a separate in-memory store and never written to real local storage. Firmware progress is explicitly a preview, not a transfer.

### Visual review

Reviewed with ui-ux-pro-max mobile guidance and the applicable design-taste-frontend rules: original Figma mascot, one Tabler outline icon family (MIT license included), short functional copy, native navigation, one primary action, visible labels on ambiguous/destructive actions, minimum 48px controls, safe-area padding, readable muted text and secondary tools behind disclosure. Figma's gradient/white cards/lime accent are adapted to the Mini Program rather than copied as static screen images. Real BLE persistence, camera scanning and phone permission prompts still need a physical-device check.


Mode selection is exclusively on the physical scale. The app has no mode wheel or mode-write handler; FEE1/FEE5 updates set the label and theme. The last confirmed profile/unit/weight text is cached with the single device association on mode/unit change, disconnect and app background. Recording snapshots does not write any BLE characteristic. KCal uses white-to-green, Kitchen white-to-yellow, Espresso white-to-coffee and Pour over white-to-orange gradients. The Devtools scene picker changes only the isolated preview renderer.

Home toolbar order is Statistics, Settings and Add device. Calendar/history browsing is only in reports. A saved device removes Add and leaves the other icons right aligned. The home + opens the same barcode/nearby discovery sheet in place, without a page transition. A successful connection reveals the live device module below Today; it does not navigate away from Home.

All page routes disable native page scrolling. The shared `scroll-surface` uses enhanced scroll-view with hidden scrollbars and a seven-tick right rail driven by actual content/viewport heights. The active tick is long, neighboring ticks medium, and the others short; a screen with no overflow needs no rail. Sheets share the same surface. Plan step four keeps all six numeric fields and navigation actions on one standard phone screen, with scrolling still available for unusually small viewports, keyboard or validation errors.

Weight unit is a single g/oz switch in Profile settings, stored under `kcalack.weight-unit.v1`. It syncs on each connection after binding/auth/setup, or after changing the switch; busy actions defer it. Failed writes retain the preference and retry on reconnect, without repeated writes on every notification. Preview preferences stay in memory. Home exposes the container weight entry only in KCal mode; there are no separate tare, navigation-to-scale, mode-changing, unit-wheel or duplicate weight controls.

Home connection status is read-only. Foreground auto-reconnect listens for Bluetooth adapter changes and scans only for the saved identity with matching local auth; it ignores cached discovery records, backs off between scan cycles/failures, waits through busy actions, and stops scanning in the background. The Rive chassis crossfades to the live WASM display, then the module contracts to a compact screen-only view with a KCal container entry.

Selecting a discovered device runs connection, binding/authentication, preset1 emotion installation and reboot as one setup flow. The add sheet stays open until setup succeeds and offers an inline retry on failure. Barcode-selected devices use the same flow. Background auto-reconnect and global unit writes wait for setup to finish; ordinary reconnects do not reinstall emotion.

Today's plan synchronizes automatically after an authenticated connection and when the daily target/TDEE, meal total or pending deletion queue changes. It waits for setup and other BLE actions, avoids duplicate notification-driven writes, and retries failed writes on a new connection or foreground session. The home status stays noninteractive: Connected / Syncing… / Disconnected; Syncing keeps the green dot with a rotating arrow. There is no manual plan-sync button or success toast.


### Server contract alignment

The profile wizard restores `users`, `user_profiles` and `user_plans` through the existing PowerSync stream before enabling setup. Birthday and weekly weight change replace age/months. `PATCH /users/profile` returns the authoritative TDEE and nutrient goals; the final step saves only supported target/macro overrides. Failed restoration offers retry rather than an empty default plan. Account changes isolate cached data and stop stale writes.

Dish calories/macros are read-only service results. Ingredient/description corrections (up to 200 characters) use `@edit`; Recalculate without a correction uses `@analysis`. Pending close offers continuing or discarding, never fabricated zeros. There is no editable five-dot rating and no WeChat account-deletion entry. Containers require a photo and allow up to 1999 g/64-character names/50 saved entries. Container cloud CRUD and full journal history replication remain separate work; this change does not claim those are connected. See [service contracts](../docs/online-services.md).
