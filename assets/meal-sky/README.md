# Meal landscape

Native Rive scene, reused by the mini program's meal photo wheel. `Daylight` has five timeline stops at 0/1/2/3/4 seconds: breakfast, lunch, dinner, misty snack, then breakfast again. The duplicate endpoint permits seamless wrap-around.

A wheel rotation must exceed 22.5 degrees, without crossing the central camera dead zone. It selects exactly one adjacent meal **on release**. The scene stays fixed during the gesture; the component then eases to the selected stop over 620 ms. No meal timestamp is derived from the landscape.

Rebuild with `python3 scripts/build-meal-sky-rive.py`, `rive assets/meal-sky --once`, copy `build/kcalack-meal-sky.riv` into this directory, then `npm run build:miniprogram`. The official Rive CLI is a build-time tool; runtime does not require a network request. Static SVG scenes cover subpackage loading or renderer failure. A radial alpha mask fades each rendered frame at its perimeter. The camera drawing lives in the Rive artboard so native canvas compositing cannot hide it; the page keeps its accessible capture button.
