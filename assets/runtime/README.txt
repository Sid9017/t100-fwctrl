T100 Web Runtime

Vendored from bk-hw-temp/projects/t100/web_runtime (source revision 330e5df0).
preview.wasm uses the original C renderer plus scripts/runtime-status.c, which
adds preview_apply_status to select the reported FEE5 screen without fake key presses.
Rebuild from this repository with:
  node scripts/build-runtime.mjs /path/to/t100/web_runtime
Set WASM_CC and, if needed, WASM_LD to clang and a native lld executable.
The build depends on shared firmware C sources; it does not modify that repository.
Only assets referenced by the runtime transport are included.

Local adaptations: English labels, collapsible controls, embedding layout,
readiness flag, openScale dispatch, and corrected unit selector conversion.
The parent src/web/preview.js subscribes to BLE status and weight notifications. It converts
FEE1 values to grams and feeds them one way into the local simulation. The
simulator does not send BLE commands or claim to reproduce the full live device
state. Device controls, binding, credentials and OAD remain in the parent app.

The parent controls now always operate the connected Bluetooth device. The
preview-only controls remain hidden inside the runtime and are not mounted in
the parent. Weight is rendered only in Wasm; the duplicate numeric display,
control target selector, device details and device lights UI have been removed.
The both-key button and weighing surface press simulation are also removed.

FEE5 drives Idle, scale/profile and sleep/wake. Incoming weight never changes the
scene. Countdown, history and notification content is absent from FEE5: these
screens show their reported name rather than demo values. Coffee phase/flags are
reported in the status label; exact elapsed time, flow and animations are not
available from this packet and are not a live screen capture.

Rebuilt against the updated notify PWM sources in the original working tree.
Notification transitions use notify_ui_pwm_request/backlight and retain pixels
through each 150 ms ramp. The status bridge calls the notify lifecycle and waits
for exit/return-in rather than assigning scene directly. Status-only notices
use an empty preview bubble because FEE5 has no text bitmap or color.
