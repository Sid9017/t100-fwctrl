/** Targeted host-adapter fixes. Firmware renderers remain the source of pixels. */
export function adaptPreview(source) {
  const replace = (before, after) => {
    if (!source.includes(before)) throw new Error(`Upstream WebRuntime changed: ${before.slice(0, 90)}`);
    source = source.replace(before, after);
  };
  replace('#define PREVIEW_INTRO_MS (2u * UI_FULLSCREEN_FADE_MS + PREVIEW_CONTENT_MS)', '#define PREVIEW_INTRO_MS (40u + 2u * UI_FULLSCREEN_FADE_MS + PREVIEW_CONTENT_MS)');
  replace('emotion_theme_draw(pixels,t,0,320,1,255);', 'emotion_theme_draw(pixels,t,0,320,1,preview_idle_opacity);');
  replace('static void countdown(void) {', 'static void countdown(void) {\n    if (preview_unknown_content & 1u) return;');
  replace('static void notification(void) {', 'static void notification(void) {\n    if (preview_unknown_content & 4u) return;');
  replace('static void history(void) {', 'static void history(void) {\n    if (preview_unknown_content & 2u) return;');
  replace('static void native_hint(void) {', `static void native_hint(void) {
    if (mode == DIET) { kcal_key_animation_t hint = kcal_key; hint.elapsed = 2u * UI_FULLSCREEN_FADE_MS;
        kcal_scale_view_key(pixels, &hint, unit_oz); return; }`);
  // Diet's old preview animated RGB565 opacity; hardware uses the same four PWM
  // ramps as Kitchen, with opaque hint/data uploads and 40 ms dark settling.
  replace('static void kitchen_apply(unsigned key) {', `static void kitchen_apply(unsigned key) {
    if (mode == DIET) { if (key == 0) { (void)kcal_container_set(-1); weight_mg=0; }
        else if (key == 1) kcal_container_tare(weight_mg); return; }`);
  replace('static void kitchen_begin(unsigned key) {', `static void kitchen_begin(unsigned key) {
    if (mode == DIET) kcal_key = (kcal_key_animation_t){KCAL_KEY_ANIMATION_MS, weight_mg,
        kcal_container_mg(), kcal_container_net_mg(weight_mg), (uint8_t)key};`);
  source=source.replaceAll('(mode != KITCHEN && mode != AMERICANO && mode != POUROVER)', '(mode != DIET && mode != KITCHEN && mode != AMERICANO && mode != POUROVER)');
  // Preserve the no-long-action policy of KCal.
  replace('if (battery_ui_active()) return;\n    if (!down)', 'if (battery_ui_active() || mode == DIET) return;\n    if (!down)');
  replace('if (scene == SCALE && (mode == KITCHEN || mode == AMERICANO || mode == POUROVER) && key', 'if (scene == SCALE && (mode == DIET || mode == KITCHEN || mode == AMERICANO || mode == POUROVER) && key');
  replace('return (int)(255u*(PREVIEW_INTRO_MS-remain)/UI_FULLSCREEN_FADE_MS);', 'return PREVIEW_INTRO_MS-remain <= 40u ? 0 : (int)(255u*(PREVIEW_INTRO_MS-remain-40u)/UI_FULLSCREEN_FADE_MS);');
  // Firmware resets the weighing session when leaving Scale, not just on entry.
  replace('scene = scene == IDLE ? COUNTDOWN : IDLE;', `if (scene == SCALE) { session_count=session_mg=kitchen_last_mg=0; coffee_session_reset(); }
        scene = scene == IDLE ? COUNTDOWN : IDLE;`);
  replace('mode_intro_until - now_ms >= PREVIEW_CONTENT_MS', 'mode_intro_until - now_ms > PREVIEW_CONTENT_MS');
  replace('void preview_render(void) {', 'void preview_render(void) {\n    if (preview_power_freeze) return;');
  return source;
}
