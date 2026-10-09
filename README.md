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
screen and P16/P17 keys. Weight is entered in the controls; the weighing surface
has no press interaction.
The second screen shows the simulator only after connecting a Bluetooth device.
The always-expanded operations panel operates the connected device directly.
The mode wheel at the simulator’s upper-left uses the original Wasm mode titles
and switches the connected device between KCal, Kitchen, Espresso and PourOver.
The top bar has no disconnect button. The controls contain recipe settings, container weight, countdown,
notifications and kcal history. The Wasm display is the only weight readout;
preview-only inputs, target selection, device details and light controls are removed.

The simulator always follows device status, using FEE5 to select the Wasm scene and FEE1 to update
weight without changing that scene. Idle stays Idle when weight arrives.
Scale mode/targets and sleep/wake follow device status. Countdown and history
show status labels because FEE5 omits their content. Notifications use the native
Wasm PWM transition with an empty preview bubble when no bitmap is available.
Unbound devices show the original runtime's sample pairing code instead of weight.
The simulator is a local rendered preview, not live screen mirroring.

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
by kcal and weight fields, a g/oz unit wheel, and a 1–5 star rating. Wheel choices
support vertical scrolling, clicks and Up/Down/Home/End keys. Selected images
retain their slot order when submitted.

Notification entry and exit match the firmware PWM model: freeze pixels during
150 ms backlight ramps, swap the frame at black, and allow 40 ms to settle before
fading in. The status bridge waits for this lifecycle instead of overriding it.
