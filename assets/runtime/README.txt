T100 Web Runtime

Rebuilt from bk-hw-temp/projects/t100/web_runtime and shared firmware sources,
source checkout HEAD ba117b4de604f60bc6289b5b59c3609b474d27f6.

Rebuild:
  node scripts/build-runtime.mjs /path/to/t100/web_runtime
Set WASM_CC and, if needed, WASM_LD to clang and a native lld executable.
The build uses temporary adapted sources and does not modify the firmware repo.

Adapters:
- scripts/runtime-parity.mjs: replaces legacy host software fades with firmware
  PWM/40 ms dark-upload behavior, native KCal keys and Idle Sleep opacity.
- scripts/runtime-status.c: FEE5 snapshots, screen transitions, coffee stage/run,
  board LCD/LED fades, battery/history dark upload and missing-content handling.
  Active FEE5 profile changes start the corresponding Scale entry. Idle profile
  updates preserve the page; entry and local mode welcomes hold titles for 600 ms.
- scripts/runtime-boot.c: shared native boot/barcode drawing with opaque frames
  and firmware PWM fades. The pairing barcode still uses sample identity.
- app.js: browser transport, canvas brightness for PWM, English labels and layout.

BLE controls remain in the parent app. FEE1 v2/v3 scale snapshots and FEE5 status flow one way
into Wasm; virtual keys are disabled while connected. Successful countdown,
immediate notification writes are mirrored for this connection. Container state
comes from FEE1, with UUID confirmation handled by the parent app. The appended
v3 UUID does not change the Wasm drawing ABI.
Unknown history/countdown/notification content is blank, explained outside the
canvas. FEE1 v2/v3 supplies signed main weight, typed upper/lower information, container/
Kitchen totals and coffee seconds/flow. It does not report every animation frame.
FEE5 lacks history page, notification bitmap/color, battery overlay phase and
local gesture state. Legacy five-byte readings have no auxiliary information.
Therefore the preview is not an exact screen capture; see the main README.

Verification:
  npm test
  node scripts/test-runtime-upstream.mjs /path/to/t100/web_runtime
  npm run test:browser
The upstream check runs 20 unchanged drawing contracts. Three legacy software
fade cases are replaced by explicit firmware PWM timing/pixel tests locally.

Rebuilt with the working-tree kcal-only History renderer and single-argument
preview_add_history(kcal). History records have no weight/unit fields.
