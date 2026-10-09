/* Keep the production provisioning FSM/wordmark renderer, but emulate the
 * hardware backlight owner rather than its software pixel-fade fallback. */
#include "provision_barcode_ui.c"
#define preview_boot_start preview_software_boot_start
#define preview_boot_stop preview_software_boot_stop
#define preview_boot_tick preview_software_boot_tick
#define preview_boot_render preview_software_boot_render
#include "boot_backend.c"
#undef preview_boot_start
#undef preview_boot_stop
#undef preview_boot_tick
#undef preview_boot_render
static unsigned boot_settle;
void preview_boot_stop(void) { preview_software_boot_stop();boot_settle=0; }
void preview_boot_start(void) { preview_software_boot_start();boot_settle=40; }
void preview_boot_tick(uint32_t dt) {
    while(dt) {
        unsigned step=dt>10?10:dt;dt-=step;
        if(boot_settle) { unsigned wait=step<boot_settle?step:boot_settle;boot_settle-=wait;step-=wait; }
        if(!step) continue;
        provision_barcode_state_t old=s_barcode.state;
        provision_barcode_ui_tick(step);
        if(old==PROVISION_BOOT_WORDMARK && s_barcode.state==PROVISION_BARCODE_FADE_IN)boot_settle=40;
    }
}
int preview_boot_backlight(void) {
    if(boot_settle || s_barcode.state==PROVISION_BARCODE_RESET_PENDING)return 0;
    unsigned t=s_barcode.elapsed_ms;
    if(s_barcode.state==PROVISION_BOOT_WORDMARK) {
        if(t<BOOT_WORDMARK_FADEIN_MS)return 255u*t/BOOT_WORDMARK_FADEIN_MS;
        if(t>=PROVISION_WORDMARK_FADE_START)return 255u*(BOOT_WORDMARK_DURATION_MS-t)/BOOT_WORDMARK_FADE_MS;
    }
    if(s_barcode.state==PROVISION_BARCODE_FADE_IN)return 255u*t/PROVISION_FADE_IN_MS;
    if(s_barcode.state==PROVISION_BARCODE_FADE_OUT)return 255u*(PROVISION_FADE_OUT_MS-t)/PROVISION_FADE_OUT_MS;
    return 255;
}
void preview_boot_render(uint16_t *pixels) {
    if(provision_barcode_ui_wordmark_active()) {
        unsigned t=s_barcode.elapsed_ms;
        if(t<BOOT_WORDMARK_FADEIN_MS)t=BOOT_WORDMARK_FADEIN_MS;
        if(t>=PROVISION_WORDMARK_FADE_START)t=PROVISION_WORDMARK_FADE_START;
        boot_wordmark_native_begin(t);
        for(unsigned x=0;x<320;x+=80)boot_wordmark_native_strip(pixels+x*80,x,0xfffffu);
    } else {
        provision_draw_static(logical);
        for(unsigned x=0;x<320;x++)for(unsigned y=0;y<80;y++)
            pixels[x*80+y]=logical[(159-x/2)*40+y/2];
    }
}
