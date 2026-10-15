# Scalebot connection animation

Approved standalone motion is now used by `/pairing/scalebot/index`.
`Pairing` runs for 2.85 seconds. The 45°-to-overhead chassis sits lower, then deforms into the left-hand brand icon over 0.75 seconds. The component measures the real brand anchor, frames the Rive endpoint onto it, and removes the fullscreen overlay when done. The underlying content is the real Home page, not a copied preview screen.

The four paint animations are Disconnected, Connecting, Connected and Syncing. The approved shell ID 1 color is army green #718563; no other shell-ID color mapping has been supplied, so this is currently the default shell color. Keep future shell color definitions here rather than guessing IDs from the reference photograph.

Rebuild: `python3 scripts/build-scalebot-rive.py`, `rive assets/scalebot --once`, copy `build/kcalack-scalebot-status.riv` to this directory, then `npm run build:miniprogram`.

Connecting cycles every 1.5 seconds; Syncing sweeps every 0.9 seconds. A 280 ms connection tremor moves the Rive indicator once on a transport-success edge; it does not run when sync completes. Ordinary saved-device reconnects never start Pairing.
