/* Build against the original T100 web_runtime translation unit. */
#include "preview.c"

static int last_status_screen = -1;
void preview_detach_status(void) { last_status_screen = -1; }

/* FEE5 selects the scene; FEE1 only supplies weight. Do not synthesize keys. */
void preview_apply_status(int screen, int profile, int primary_mg, int water_mg) {
    int target;
    switch (screen) {
        case 1: case 2: target = IDLE; break;
        case 3: target = COUNTDOWN; break;
        case 4: case 7: target = SCALE; break;
        case 5: target = HISTORY; break;
        case 6: target = NOTIFY; break;
        default: return;
    }
    preview_boot_stop();
    if (target == NOTIFY) {
        if (last_status_screen != screen && !notify_ui_is_active()) {
            /* Status carries no bitmap: use an empty notice, not demo text. */
            for (unsigned i = 0; i < 5088; ++i) notify_bmp_buf()[i] = 0;
            preview_notify_color(0xb6e0);
        }
        last_status_screen = screen;
        preview_render();
        return;
    }
    last_status_screen = screen;
    if (notify_ui_is_active()) {
        notify_ui_dismiss_by_key();
        preview_render();
        return;
    }
    /* Let exit-out, dark upload and return-in finish before selecting a page. */
    if (notify_ui_pwm_request().token) { preview_render(); return; }
    reference_page = -1;
    if (scene != target) {
        battery_ui_reset();
        page_fade = kitchen_phase = mode_preview_phase = 0;
        mode_intro_until = 0;
        page_scene = scene = target;
    }
    if (profile >= 0 && profile <= 3) {
        static const int profiles[] = {KITCHEN, AMERICANO, POUROVER, DIET};
        if (mode != profiles[profile]) {
            mode = profiles[profile];
            coffee_session_reset();
        }
    }
    if (primary_mg >= 0 && water_mg >= 0) {
        primary_target_mg = primary_mg;
        water_target_mg = water_mg;
    }
    preview_render();
}

int notify_ui_backlight_active(void) { return notify_ui_pwm_request().token != 0; }
