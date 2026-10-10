# T100 MFG Web Console

Browser port of the Bluetooth workflows in `bk-hw-temp/projects/t100/mfg_app`.
The interface is English and runs as a static website. Selecting a device in the
browser picker immediately connects it; no second Connect click is required.

## Run locally

Requires Node.js 22 or later:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:8766. Set `PORT=8767` to choose another port. The development
server builds the application at startup; restart it after source changes.

```sh
npm test
npm run build
npm run preview
npm run test:browser
```

Browser tests use an installed Google Chrome and a mock Bluetooth peripheral.
They never connect to or modify physical hardware. Playwright starts a local
server on port 8767 unless one is already running there.

## Companion interface

The responsive interface keeps three horizontal screens: connection, live device
controls, and OAD. Swiping, keyboard navigation and the small page indicators
switch screens without discarding form values. Connection opens the control screen.
The phone header groups Bind, Reset and Factory under Actions; Activity opens the
log and detailed device status.

The visual direction follows the supplied T100 Figma reference, with UI UX Pro Max
and Taste Skill guidance: warm light surfaces, touch-sized actions and grouped
mobile forms. The supplied device silhouette is redrawn as monochrome SVG contours
in `assets/scale-outline.svg` and `assets/scale-illustration.svg`. The connected
preview retains the original live Wasm canvas, status mapping and key handlers.
These assets, fonts and runtime files are served locally with no design-service
or CDN dependency. The app uses native CSS and retains the existing JavaScript stack.

## Bluetooth features

- T100 manufacturer-data filtering, direct connection after selection,
  reconnect through the browser picker, explicit disconnect, and connection-loss handling.
- Device firmware and clock readout; automatic CTS time synchronization on connection.
- Live battery, FEE1 weight and FEE5 screen/phase/mode/flags notifications.
- Signed P-256 binding token verification, auth persistence before bind commit,
  EMO2 emotion upload, CRC-bound FEE4 theme selection and device restart.
  Retrying an already bound device skips bind commit and resumes emotion installation.
- Tare, g/oz units, scale navigation, KCal/Kitchen/Espresso/PourOver modes,
  coffee recipe preview/persistence and target progress.
- KCal container weight with distinct zero and clear operations.
- Left/right white lights and shared brightness.
- Countdown target/remaining values, including negative remaining values.
- Notification text rasterization and bitmap BEGIN/CHUNK/COMMIT upload.
- KCal history records, rating, UUID/timestamp and up to three food photos,
  using the original RGB565 + alpha framing.
- OAD firmware file selection, ChunkX upload, retransmission and progress.
  Success requires a device acknowledgement; a disconnect alone is not success.
- Authenticated reset and public factory reset, with local credential cleanup
  after a successful command write.

Serial flashing is deferred by request. NFC pull is not exposed because the
T100 firmware and original application disable that feature. The current original
application provisions complete emotion packs through Bind; its dormant legacy
mouth editor is not exposed here.

## Browser credentials

Credentials are stored in this site's `localStorage` under `t100.mfg.auth.v1`.
Records are matched by the selected device name and contain its compressed public
key, eight-character auth code and browser device ID. Binding reads and verifies
the token from the connected device without comparing its public key to the
browser's potentially cached name. Credentials survive reloads and browser restarts.
Binding is not committed if local storage cannot save and read back the credential.
Failed emotion uploads keep the credential available for retry.

Reset and Factory remove this device's local credential after the command write
succeeds, then wait for device disconnection with a six-second reboot watchdog.
A successful write or disconnection does not prove flash erasure completed;
reconnect to verify the resulting device state. Credentials are scoped to this
browser profile and site origin and are never sent to a server.

## Browser-specific behavior

Use desktop Chrome / Edge or Android Chrome over HTTPS. Localhost is allowed for
local development; a phone opening a computer's HTTP LAN address is not a secure
context. Bluetooth must be enabled and browser/system access allowed.

The browser picker does not expose advertisement bytes, MAC addresses or RSSI.
Scanning always includes all T100 devices: manufacturer subtype `P` and product 1,
with no version or Shell ID restriction. Devices from other product families are
excluded. Binding installs the bundled preset1 emotion pack without a Shell ID
selection or filter.

All GATT calls are serialized. Timeouts disconnect the old session so unfinished
work cannot continue writing into a new session. The original upload packet
formats, CRCs and pacing are retained. Web Bluetooth does not expose ATT MTU;
the original 512-byte fallback is used for ChunkX/upload sizing. Large writes and
actual flash behavior still need verification on each target browser/platform and
physical T100 firmware version.

## Deployment

Netlify uses the repository root, `npm run build`, and publish directory `dist`.
The build bundles browser code and copies only the UI and public food/emotion
assets; tests, source tooling and credential storage are not published. No backend
or build-time credentials are needed.

## Source and verification

The migration references `bk-hw-temp` revision `330e5df0` and the local
`projects/t100/mfg_app` implementation. Protocol modules and their regression
vectors live in `src/vendor`; browser GATT/auth/workflow adapters are in `src/web`.
`src/renderer.js` retains the original interactive controls and renderer behavior.
The preset1 binary is the firmware's validated `fw_assets/emotion/default_v2.bin`.

`npm test` covers the original wire formats plus browser auth validation, signed
tokens, picker service grants, GATT serialization and abort behavior. Browser
integration tests exercise selection/connection, notifications, binding retries,
failed storage, commands, food and notification uploads, OAD, imports and reset.
Actual Bluetooth communication and firmware effects require a real-device check.

## T100 Web Runtime simulator

The Device Studio embeds the original T100 C/Wasm renderer from
`bk-hw-temp/projects/t100/web_runtime`. It preserves the device outline, RGB565
screen and P16/P17 key shapes. Weight comes from Bluetooth notifications; the
weighing surface has no press interaction.
The second screen shows the simulator only after connecting a Bluetooth device.
The always-expanded operations panel operates the connected device directly.
The mode wheel at the simulator’s upper-left uses the original Wasm mode titles
and switches the connected device between KCal, Kitchen, Espresso and PourOver.
The top bar has no disconnect button. The controls contain recipe settings, container weight, countdown,
notifications and kcal history. The Wasm display is the only weight readout;
preview-only inputs, target selection, device details and light controls are removed.

The simulator follows FEE5 screen/phase and FEE1 weight without changing the scene
when weight arrives. It uses the shared firmware C renderers and state machines.
The host adapter models PWM fades with opaque framebuffer content, 40 ms dark
uploads, native title/key transitions, history reveal, notification dismissal,
boot/barcode and battery transitions. Idle Sleep uses native mouth opacity 51/255;
board sleep/reset fades the display over 150 ms and LEDs over 600 ms.
Coffee stage/run flags follow status; a selected profile applies on the next
Scale entry, as in firmware. Virtual P16/P17 keys are disabled while following a
connected device because the BLE protocol has no physical-key command.

FEE5 does not expose history entries/page, notification bitmap/color, countdown
values, exact coffee elapsed time/grounds/tare, battery overlay phase, or local
key/Idle gestures. Successful countdown/container/notification writes from this
browser are mirrored for the current connection; unknown content stays blank
with an explanation outside the display. Coffee timing is estimated from observed
run/pause flags. Unbound devices use the runtime's sample pairing identity.
These protocol limits prevent exact live screen mirroring; reconnect clears the
session's preview data. No firmware source files are modified by the build.

Validate the bundled Wasm with `npm test`. With the original source checkout,
`node scripts/test-runtime-upstream.mjs /path/to/t100/web_runtime` also runs
20 upstream rendering contracts. Three older software-fade timing cases are
excluded and replaced by PWM/settle assertions in `tests/runtime-parity.test.js`.
Browser integration checks run with `npm run test:browser`.

The prebuilt runtime and its source provenance are in `assets/runtime/README.txt`.
Hosting must serve `.wasm` files and allow `wasm-unsafe-eval` plus same-origin
frames in CSP; the local server and Netlify configuration include these settings.

The app uses three horizontal screens: **Connect**, **Scale & Display** (the
Wasm simulator and device controls), and **OAD**. Selecting a Bluetooth device
connects immediately; a successful connection slides to the second screen.
Switch with a horizontal swipe or mouse drag on the page surface, or a
horizontal trackpad gesture. There are no navigation tabs. The focused screen
container also supports Left/Right/Home/End keys. Sliders and simulator gestures
keep their own behavior. Each screen scrolls vertically and retains its state.

Custom bind/NFC service permissions include the firmware's mixed-endian UUID
forms, matching the desktop application's UUID handling. Connection state uses
the FEE5 BOUND flag when available; missing bind-service discovery alone does not
prove a device is bound. After updating an older page, disconnect and select the
device again so the browser grants the additional service UUIDs.

Kcal history uses three independent image wheels (including No image), followed
by a kcal field and a 1–5 dot rating. History no longer includes weight or unit;
the live scale retains its g/oz selector. Wheel choices
support vertical scrolling, clicks and Up/Down/Home/End keys. Selected images
retain their slot order when submitted.

Notification entry and exit match the firmware PWM model: freeze pixels during
150 ms backlight ramps, swap the frame at black, and allow 40 ms to settle before
fading in. The status bridge waits for this lifecycle instead of overriding it.


Kcal history RECORD (0x65) uses UUID16, timestamp u32 LE, kcal u32 LE and flags,
optionally followed by rating (1..5) and photo_count (0..3). Before auth8 wrapping,
the payload is 26/28 bytes: UUID at 1, timestamp at 17, kcal at 21, flags at 25,
rating at 26 and photo_count at 27. Authenticated ATT values are 34/36 bytes.
Flags are 0 for no images, 1 for images and 2 for deletion by UUID. Delete uses
the 26-byte payload with all metadata except UUID/flags zeroed. The old weight/unit
layout is incompatible with the updated firmware. IMAGE_BEGIN/DATA/COMMIT/ABORT
and each 40x40 RGB565+alpha image are unchanged. Firmware handles Flash migration;
the browser does not migrate device records.


## Latest OAD service

The third screen automatically downloads and selects the latest validated OAD
on connection. It never starts flashing automatically. Manual file selection
cancels the automatic fetch; disconnect and a new connection invalidate stale
requests. Missing releases, network errors or invalid images leave manual
selection available. Downloads have a 20-second timeout and verify the APP-only
header, version, byte length and SHA256 before becoming selectable.

Netlify Functions expose these same-origin endpoints:

- `POST /api/ota/latest`: authenticated multipart upload; fields `firmware`
  (APP-only `.bin`) and `metadata` (JSON string). Requires
  `Authorization: Bearer <token>` and `Idempotency-Key`.
- `GET /api/ota/latest`: latest metadata plus `downloadUrl`, or 404 before the
  first publish. Never cached.
- `GET /api/ota/download/<sha256>`: exact latest binary, or 404 if that digest
  has been replaced. The client retries metadata once after this 404.

Metadata schema 1 contains `product: "t100"`, `kind: "oad"`, `version` (lowercase
`0xNNNN` from the image header), `commitSha` (40 lowercase hex characters),
`ref: "refs/heads/main"`, `workflow: ".github/workflows/t100-firmware.yml"`,
`runId` (decimal string), `runNumber`/`runAttempt` (positive integers), `builtAt`
(UTC ISO8601 ending in Z), `size` (bytes), and `sha256` (64 lowercase hex
characters). No extra metadata fields are accepted. The Idempotency-Key is
SHA256 of UTF-8 `workflow:runId:runAttempt:sha256`. The service rejects merged
flash images and accepts APP-only images up to 240 KiB, aligned to 16 bytes.
The bearer token authorizes publication; metadata is not a GitHub signature.

A site-wide Netlify Blobs store `t100-ota` uses strong consistency and conditional
writes. A single `latest` entry atomically contains metadata and the binary, so
readers cannot mix versions. The `(runNumber, runAttempt)` sequence must belong
to the fixed trusted workflow. Newer releases replace that entry; older releases
return 200 `stale`, exact repeats return 200 `unchanged`, and conflicting reuse
of an idempotency key or current sequence returns 409. Small hash-only receipts
persist for idempotency; they contain no old firmware. Only one firmware copy
is retained. Receipt records are intentionally not pruned automatically.

Deployment configuration (not performed automatically):

1. Deploy this repository to the existing Netlify site, including its functions.
2. Set `T100_OTA_UPLOAD_TOKEN` in Netlify environment variables, Functions scope,
   production context only. Use a randomly generated secret of at least 32
   characters. Do not put it in frontend code, git or `netlify.toml`.
3. Put the identical token in the firmware repo's Actions Secret
   `T100_OTA_UPLOAD_TOKEN`. Set Actions Variable `T100_OTA_UPLOAD_URL` to
   `https://t100-ctrl.netlify.app/api/ota/latest`.
4. Once the endpoint is deployed and ready for integration, enable Actions
   Variable `T100_OTA_ENABLED=true`. The CI task owns main-only publishing and
   the explicit `publish_ota=true` gate for manual runs. Keep this switch off
   until deployment is confirmed.

The metadata and download endpoints are public; firmware must be suitable for
public distribution. No GitHub credentials are delivered to the browser.
Netlify supplies Blobs credentials to deployed functions automatically. Blobs
usage is subject to the site's Netlify plan. See [Netlify Blobs documentation](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
for conditional writes and consistency.

`npm run dev` serves the same API using an in-memory store: local uploads are
lost when that process restarts and never affect production. Set the local
`T100_OTA_UPLOAD_TOKEN` environment variable to test publishing; without it POST
returns 503. Restart an already running preview server after these changes.
`npm test` covers upload validation, authorization, idempotency, stale/concurrent
publishes, replacement, download races and corrupted bytes. Browser tests cover
automatic selection, manual fallback and request cancellation.
