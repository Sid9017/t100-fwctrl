# KCALACK device pairing

The actual Rive resource is `kcalack-pairing.riv`. It uses the existing single-color
chassis curves, two LED circles, rear fade and a soft monochrome ground shadow.
No bitmap, text, shader or script is embedded. The one-shot `Pairing` animation
holds an overhead view briefly, then morphs the projected vector control points
into a 45-degree view over two seconds. This is a vector perspective animation,
not a textured 3D model.

Rebuild with the official Rive CLI:

```sh
python3 scripts/build-pairing-rive.py
rive assets/pairing --verify
rive inspect assets/pairing --summary
rive assets/pairing --once
cp assets/pairing/build/kcalack-pairing.riv assets/pairing/kcalack-pairing.riv
npm run build:miniprogram
```

The native `pairing` subpackage loads the compiled resource from embedded base64
with `WXWebAssembly` and Canvas 2D. It has no remote asset or Rive account dependency.
A newly added device goes through this scene automatically; an ordinary reconnect
goes straight to controls. The arrow skips the scene. Backgrounding pauses both
rendering and navigation, and leaving the page releases the renderer.

The Mini Program adapter is vendored from
[rive-weapp](https://github.com/henrywhuang/rive-weapp), MIT, with its license in
`miniprogram/pairing/libs/rive/LICENSE`. The adapter uses a source-built Rive lite
runtime. Only runtime, layout, adapter and vendor files are included; no demo assets
or third-party networking entry points are included.
