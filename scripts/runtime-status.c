/* Device status is a snapshot, not a stream of local key presses. All drawing
 * stays in the firmware renderers included by the upstream WebRuntime. */
#include "board/t100_pins.h"
static unsigned char preview_idle_opacity = 255;
static unsigned preview_power_freeze;
static unsigned preview_unknown_content;
static unsigned history_settle_ms, battery_settle_ms;
#define preview_tick preview_local_tick
#define preview_reset preview_local_reset
#define preview_backlight_level preview_local_backlight_level
#define history_pager_tick preview_history_tick
#define battery_ui_tick preview_battery_tick
#include "preview.c"
#undef preview_tick
#undef preview_reset
#undef preview_backlight_level
#undef history_pager_tick
#undef battery_ui_tick
void battery_ui_tick(uint32_t ms);
int preview_boot_backlight(void);
void preview_battery_tick(uint32_t ms) {
    if (battery_settle_ms) {
        unsigned step=ms<battery_settle_ms?ms:battery_settle_ms;
        battery_settle_ms-=step;ms-=step;if(!ms)return;
    }
    ui_pwm_fade_request_t old=battery_ui_pwm_request();
    battery_ui_tick(ms);
    ui_pwm_fade_request_t next=battery_ui_pwm_request();
    if(old.token != next.token && next.fade_in)battery_settle_ms=40;
}
void history_pager_tick(uint32_t ms);
void preview_history_tick(uint32_t ms) {
    if (history_settle_ms) {
        unsigned step = ms < history_settle_ms ? ms : history_settle_ms;
        history_settle_ms -= step; ms -= step;
        if (!ms) return;
    }
    unsigned old = history_pager_page();
    history_pager_tick(ms);
    if (old != history_pager_page()) history_settle_ms = 40;
}

static int last_status_screen = -1, remote_profile = -1;
static unsigned remote_active, countdown_known, notify_known, scale_handoff;
static unsigned remote_flags;
static int remote_coffee_stage;
static void remote_sync_coffee(void) {
    if (scene != SCALE || (mode != AMERICANO && mode != POUROVER)) return;
    unsigned water = remote_coffee_stage == 2 || (remote_flags & (1u<<12));
    if (!water && coffee_session_get()->extracting) coffee_session_reset();
    if (water && !coffee_session_get()->extracting) (void)coffee_session_action(0,0);
    if (water && !!(remote_flags & (1u<<11)) != !!coffee_session_get()->running)
        (void)coffee_session_action(0,weight_mg);
}
static unsigned led_elapsed=T100_WHITE_LED_FADE_MS, led_from=255, led_to=255;
static unsigned power_elapsed = UI_FULLSCREEN_FADE_MS, power_from = 255, power_to = 255;
static int remote_target(int screen) {
    switch(screen) {
        case 1: case 2: return IDLE;
        case 3: return COUNTDOWN;
        case 4: case 7: return SCALE;
        case 5: return HISTORY;
        case 6: return NOTIFY;
        default: return -1;
    }
}
void preview_detach_status(void) {
    last_status_screen = -1; remote_profile = -1; remote_active = 0;
    remote_flags=0;remote_coffee_stage=0;
    countdown_known = notify_known = preview_unknown_content = 0;
    preview_idle_opacity = 255; history_settle_ms = battery_settle_ms = scale_handoff = 0;
    power_from = power_to = led_from = led_to = 255; power_elapsed = UI_FULLSCREEN_FADE_MS;
    led_elapsed=T100_WHITE_LED_FADE_MS;preview_power_freeze=0;
}
void preview_reset(void) { preview_detach_status(); preview_local_reset(); }
int preview_backlight_level(void) {
    if (power_to == 0 || power_elapsed < UI_FULLSCREEN_FADE_MS)
        return (int)power_from + ((int)power_to-(int)power_from)*(int)power_elapsed/(int)UI_FULLSCREEN_FADE_MS;
    if (preview_boot_active()) return preview_boot_backlight();
    if (history_settle_ms || battery_settle_ms) return 0;
    return preview_local_backlight_level();
}
int preview_power_led_opacity(void) {
    return (int)led_from+((int)led_to-(int)led_from)*(int)led_elapsed/(int)T100_WHITE_LED_FADE_MS;
}
static void remote_select(int target, int first, int profile) {
    unsigned source_level=preview_backlight_level();
    int old_scene=scene;
    if (target == SCALE && (scene != SCALE || first)) {
        static const int profiles[] = {KITCHEN, AMERICANO, POUROVER, DIET};
        if (profile >= 0 && profile <= 3) mode = profiles[profile];
        coffee_session_reset(); session_count=session_mg=kitchen_last_mg=0;
        kcal_container_clear_tare(); pour_progress=0;
        scale_handoff = !first && old_scene == COUNTDOWN;
        mode_intro_until = first ? 0 : now_ms + PREVIEW_INTRO_MS;
        kitchen_phase = mode_preview_phase = 0;
    }
    if (scene == SCALE && target != SCALE) {
        coffee_session_reset(); session_count=session_mg=kitchen_last_mg=0;
        mode_intro_until = kitchen_phase = 0;
    }
    if (first) { page_fade=0; page_scene=target; }
    scene = target;
    preview_render(); /* Uses upstream page/PWM transitions instead of cancelling them. */
    if (old_scene != target && page_fade == 1) page_start_level=source_level;
}
void preview_apply_device_status(int screen, int phase, int board, unsigned flags,
                                int schema, int profile, int coffee_stage, int ui_phase,
                                int primary_mg, int water_mg) {
    (void)ui_phase; /* Legacy coffee UI phase is not native key-hint metadata. */
    int target = remote_target(screen), first = last_status_screen < 0;
    if (target < 0) return;
    remote_active=1;
    preview_boot_stop(); reference_page=-1;
    unsigned off = board == 4 || board == 5 || board == 6;
    if (off != (power_to == 0)) {
        power_from = (unsigned)preview_backlight_level(); power_to = off ? 0 : 255;
        power_elapsed = first && off ? UI_FULLSCREEN_FADE_MS : 0;
        led_from=preview_power_led_opacity();led_to=off?0:255;
        led_elapsed=first && off ? T100_WHITE_LED_FADE_MS : 0;
        preview_power_freeze=off;
    }
    /* Native Idle uses 51/255 pixel opacity in screen sleep; board sleep is off. */
    preview_idle_opacity = screen == 2 ? 51 : 255;
    preview_unknown_content = ((screen == 3 && phase != 0 && !countdown_known) ? 1u : 0u)
                            | (screen == 5 ? 2u : 0u) | (screen == 6 && !notify_known ? 4u : 0u);
    if (screen == 3 && phase == 0) { current_kcal=0;target_kcal=0;countdown_known=0; }
    if (target == NOTIFY) {
        if (last_status_screen != screen && !notify_ui_is_active()) {
            if (!notify_known) for(unsigned i=0;i<5088;i++)notify_bmp_buf()[i]=0;
            preview_notify_color(0xb6e0);
            if (first && phase != 0) preview_local_tick(2*UI_FULLSCREEN_FADE_MS+40);
        }
        if (phase == 2 && notify_ui_is_active() && !notify_ui_is_exiting()) notify_ui_dismiss_by_key();
    } else if (notify_ui_is_active()) {
        notify_ui_dismiss_by_key();
    } else if (!notify_ui_pwm_request().token) {
        remote_select(target,first,(schema==1 || schema==2)?profile:-1);
    }
    if (last_status_screen == 6 && screen != 6) notify_known=0;
    last_status_screen=screen;
    if (schema == 1 || schema == 2) {
        remote_profile=profile;
        if (primary_mg >= 0 && water_mg >= 0) { primary_target_mg=primary_mg;water_target_mg=water_mg; }
        remote_flags=flags;remote_coffee_stage=coffee_stage;
        remote_sync_coffee();
    }
    preview_render();
}
/* Compatibility for integrations using the original four-argument bridge. */
void preview_apply_status(int screen,int profile,int primary_mg,int water_mg) {
    preview_apply_device_status(screen,0,2,1,2,profile,1,2,primary_mg,water_mg);
}
void preview_tick(uint32_t ms) {
    if (power_elapsed < UI_FULLSCREEN_FADE_MS) {
        unsigned left=UI_FULLSCREEN_FADE_MS-power_elapsed;
        power_elapsed+=ms<left?ms:left;
    }
    if (led_elapsed < T100_WHITE_LED_FADE_MS) {
        unsigned left=T100_WHITE_LED_FADE_MS-led_elapsed;
        led_elapsed+=ms<left?ms:left;
    }
    if (preview_power_freeze) return;
    while (scale_handoff && ms) {
        unsigned step=ms>10?10:ms;ms-=step;preview_local_tick(step);
        if (page_fade == 2) {
            page_fade=0;page_scene=scene;scale_handoff=0;
            mode_intro_until=now_ms+PREVIEW_INTRO_MS;preview_render();
        }
    }
    if (ms) preview_local_tick(ms);
    if (remote_active && last_status_screen != 6 && !notify_ui_is_active() &&
        !notify_ui_pwm_request().token && scene != remote_target(last_status_screen))
        { remote_select(remote_target(last_status_screen),0,remote_profile); remote_sync_coffee(); preview_render(); }
}
void preview_remote_countdown(int current, unsigned target) {
    current_kcal=current;target_kcal=target;countdown_known=1;
    preview_unknown_content &= ~1u; preview_render();
}
void preview_remote_notify(unsigned color) {
    notify_known=1; preview_unknown_content &= ~4u; preview_notify_color(color);
}
int preview_remote_missing(void) { return preview_unknown_content | (remote_active && last_status_screen == 6 && !notify_known ? 4u : 0u); }
int notify_ui_backlight_active(void) { return notify_ui_pwm_request().token != 0; }
