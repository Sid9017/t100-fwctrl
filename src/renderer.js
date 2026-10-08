import { renderHistoryControls } from './web/history-controls.js';
const DEVICE_TIME_IDLE = '--';
const SIM_FIRMWARE_BTN_LABEL = 'Select OAD firmware';

const VIEWS = ['connect', 'test', 'oad'];

const state = {
  devices: [],
  selectedDevice: null,
  activeView: 'connect',
  connected: false,
  actionBusy: false,
  connecting: false,
  deviceCards: new Map(),
  deviceOrder: '',
  deviceTimeSampleUnix: null,
  deviceTimeSampleWallMs: null,
  deviceTimeTickTimer: null,
  connectAttemptSeq: 0,
  simFirmwarePath: '',
  simOadBusy: false,
  simOadOutcomeAnimating: false,
  kcalHistBusy: false,
  containerBusy: false,
  morphThemeBusy: false,
  histFoodItems: [],
  histFoodSelected: '',
  scaleReading: null,
  deviceStatus: null,
  coffee: {
    mode: 3,
    baseMg: 15000,
    ratio: 16,
    primaryTargetMg: 15000,
    waterTargetMg: 240000,
    hydrated: false,
    sendInFlight: false,
    pendingSend: null,
    previewTimer: null,
    commitTimer: null,
    profileSendInFlight: false,
    drafts: {
      1: {
        baseMg: 36000,
        ratio: 2,
        primaryTargetMg: 36000,
        waterTargetMg: 72000,
      },
      2: {
        baseMg: 15000,
        ratio: 16,
        primaryTargetMg: 15000,
        waterTargetMg: 240000,
      },
    },
  },
  logDrawerOpen: false,
};

const refs = {
  homeBrandBtn: document.querySelector('#homeBrandBtn'),
  logDrawer: document.querySelector('#logDrawer'),
  logDrawerToggle: document.querySelector('#logDrawerToggle'),
  logDrawerClose: document.querySelector('#logDrawerClose'),
  connectBusyHost: document.querySelector('#connectBusyHost'),
  simMainPanel: document.querySelector('#connectBusyHost') || document.querySelector('.sim-main-panel'),
  simActionPanel: document.querySelector('.sim-action-panel'),
  simRefreshScanBtn: document.querySelector('#simRefreshScanBtn'),
  simTargetName: document.querySelector('#simTargetName'),
  simTargetBattery: document.querySelector('#simTargetBattery'),
  simDeviceStatus: document.querySelector('#simDeviceStatus'),
  simTargetMeta: document.querySelector('#simTargetMeta'),
  simStateLed: document.querySelector('#simStateLed'),
  simStateText: document.querySelector('#simStateText'),
  simFirmwareText: document.querySelector('#simFirmwareText'),
  simDeviceTimeText: document.querySelector('#simDeviceTimeText'),
  simResetBtn: document.querySelector('#simResetBtn'),
  simNavigateScaleBtn: document.querySelector('#simNavigateScaleBtn'),
  simContainerFields: document.querySelector('#simContainerFields'),
  simContainerWeight: document.querySelector('#simContainerWeight'),
  simContainerSet: document.querySelector('#simContainerSet'),
  simContainerClear: document.querySelector('#simContainerClear'),
  simContainerStatus: document.querySelector('#simContainerStatus'),
  simTareBtn: document.querySelector('#simTareBtn'),
  simUnitBtn: document.querySelector('#simUnitBtn'),
  simCoffeeModeSelect: document.querySelector('#simCoffeeModeSelect'),
  simCoffeeRecipeFields: document.querySelector('#simCoffeeRecipeFields'),
  simCoffeeBaseLabel: document.querySelector('#simCoffeeBaseLabel'),
  simCoffeeBaseRange: document.querySelector('#simCoffeeBaseRange'),
  simCoffeeBaseInput: document.querySelector('#simCoffeeBaseInput'),
  simCoffeeBaseUnit: document.querySelector('#simCoffeeBaseUnit'),
  simCoffeeRatioLabel: document.querySelector('#simCoffeeRatioLabel'),
  simCoffeeRatioRange: document.querySelector('#simCoffeeRatioRange'),
  simCoffeeRatioValue: document.querySelector('#simCoffeeRatioValue'),
  simCoffeePrimaryName: document.querySelector('#simCoffeePrimaryName'),
  simCoffeePrimaryTarget: document.querySelector('#simCoffeePrimaryTarget'),
  simCoffeeWaterTarget: document.querySelector('#simCoffeeWaterTarget'),
  simCoffeePrimaryProgress: document.querySelector('#simCoffeePrimaryProgress'),
  simCoffeeWaterProgress: document.querySelector('#simCoffeeWaterProgress'),
  simCoffeeSyncState: document.querySelector('#simCoffeeSyncState'),
  simCoffeeApplyBtn: document.querySelector('#simCoffeeApplyBtn'),
  simKcalUpdateBtn: document.querySelector('#simKcalUpdateBtn'),
  simNotifyBtn: document.querySelector('#simNotifyBtn'),
  simNotifyColorInput: document.querySelector('#simNotifyColorInput'),
  simNotifyTextInput: document.querySelector('#simNotifyTextInput'),
  simAppendKcalBtn: document.querySelector('#simAppendKcalBtn'),
  simHistFoodPicker: document.querySelector('#simHistFoodPicker'),
  simHistFoodTrigger: document.querySelector('#simHistFoodTrigger'),
  simHistFoodTriggerImg: document.querySelector('#simHistFoodTriggerImg'),
  simHistFoodTriggerLabel: document.querySelector('#simHistFoodTriggerLabel'),
  simHistFoodMenu: document.querySelector('#simHistFoodMenu'),
  simHistKcalInput: document.querySelector('#simHistKcalInput'),
  simHistWeightInput: document.querySelector('#simHistWeightInput'),
  simHistUnitSelect: document.querySelector('#simHistUnitSelect'),
  simCurrentKcalInput: document.querySelector('#simCurrentKcalInput'),
  simTargetKcalInput: document.querySelector('#simTargetKcalInput'),
  factoryBtn: document.querySelector('#factoryBtn'),
  simBindBtn: document.querySelector('#simBindBtn'),
  simOadBtn: document.querySelector('#simOadBtn'),
  simScaleValue: document.querySelector('#simScaleValue'),
  simScaleUnit: document.querySelector('#simScaleUnit'),
  simFirmwareBtn: document.querySelector('#simFirmwareBtn'),
  simOadProgressText: document.querySelector('#simOadProgressText'),
  simOadProgressTrack: document.querySelector('#simOadProgressTrack'),
  simOadProgressBar: document.querySelector('#simOadProgressBar'),
  simLog: document.querySelector('#simLog'),
  simClearLogBtn: document.querySelector('#simClearLogBtn'),
};

function nowLabel() {
  return new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatLocalDateTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

const SHARED_LOG_MAX_LINES = 500;
const sharedLogEntries = [];

function formatFailureMessage(prefix, message) {
  const msg = String(message || 'unknown error').trim();
  if (!msg) return prefix.replace(/：$/, '');
  if (msg.startsWith(prefix)) return msg;
  return `${prefix}${msg}`;
}

function renderSharedLogs() {
  if (!refs.simLog) return;
  refs.simLog.innerHTML = '';
  for (const entry of sharedLogEntries) {
    refs.simLog.appendChild(buildSharedLogRow(entry));
  }
  refs.simLog.scrollTop = refs.simLog.scrollHeight;
}

function buildSharedLogRow(entry) {
  const row = document.createElement('div');
  if (entry.progressKey) {
    row.dataset.progressKey = entry.progressKey;
    row.classList.add('log-progress');
  }
  const time = document.createElement('span');
  time.textContent = entry.time;
  row.appendChild(time);
  row.append(entry.message);
  return row;
}

function pushSharedLog(message, options = {}) {
  const clean = String(message || '').trim();
  if (!clean) return;
  const progressKey = options.progressKey ? String(options.progressKey) : '';

  if (progressKey) {
    for (let i = sharedLogEntries.length - 1; i >= 0; i -= 1) {
      if (sharedLogEntries[i].progressKey === progressKey) {
        sharedLogEntries[i].message = clean;
        const row = refs.simLog
          ? refs.simLog.querySelector(`[data-progress-key="${CSS.escape(progressKey)}"]`)
          : null;
        if (row) {
          while (row.childNodes.length > 1) row.removeChild(row.lastChild);
          row.append(clean);
          return;
        }
        renderSharedLogs();
        return;
      }
    }
  }

  const entry = {
    time: nowLabel(),
    message: clean,
    progressKey: progressKey || undefined,
  };
  sharedLogEntries.push(entry);
  let truncated = false;
  while (sharedLogEntries.length > SHARED_LOG_MAX_LINES) {
    sharedLogEntries.shift();
    truncated = true;
  }
  if (!refs.simLog || truncated) {
    renderSharedLogs();
    return;
  }
  refs.simLog.appendChild(buildSharedLogRow(entry));
  refs.simLog.scrollTop = refs.simLog.scrollHeight;
}

function pushLog(message) {
  pushSharedLog(message);
}

function pushSimLog(message, options = {}) {
  pushSharedLog(message, options);
}

function resetSharedLog() {
  sharedLogEntries.length = 0;
  if (refs.simLog) refs.simLog.innerHTML = '';
}

function resetSimLog() {
  resetSharedLog();
}

function syncTabContentHeight() {
  /* no-op: modular views fill the resizable window */
}

function setLogDrawerOpen(open) {
  state.logDrawerOpen = Boolean(open);
  if (refs.logDrawer) {
    refs.logDrawer.classList.toggle('is-open', state.logDrawerOpen);
    refs.logDrawer.setAttribute('aria-hidden', state.logDrawerOpen ? 'false' : 'true');
  }
  if (refs.logDrawerToggle) {
    refs.logDrawerToggle.setAttribute('aria-expanded', state.logDrawerOpen ? 'true' : 'false');
    refs.logDrawerToggle.textContent = state.logDrawerOpen ? 'LOG·ON' : 'LOG·OFF';
  }
}

function suggestedGuideStep() {
  return state.connected ? 'test' : 'connect';
}

function syncGuideAndModuleUi() {
  const connected = Boolean(state.connected && !state.connecting);

  const badges = {
    connect: connected
      ? {
          text: deviceBindState(state.selectedDevice) === 'bound' ? 'BOUND' : 'LINK',
          cls: 'is-ok',
        }
      : state.connecting
        ? { text: 'WAIT', cls: 'is-warn' }
        : { text: 'IDLE', cls: '' },
    test: connected ? { text: 'OPEN', cls: 'is-ready' } : { text: 'LOCK', cls: '' },
    oad: connected
      ? state.simFirmwarePath
        ? { text: 'OPEN', cls: 'is-ready' }
        : { text: 'FILE', cls: 'is-warn' }
      : { text: 'LOCK', cls: '' },
  };

  Object.entries(badges).forEach(([key, info]) => {
    document.querySelectorAll(`[data-badge-for="${key}"]`).forEach((el) => {
      el.textContent = info.text;
      el.classList.remove('is-ready', 'is-ok', 'is-warn');
      if (info.cls) el.classList.add(info.cls);
    });
  });

  const gateOk = connected;
  document.querySelectorAll('[data-gate="connected"]').forEach((el) => {
    el.hidden = gateOk;
  });
  document.querySelectorAll('[data-gate-content="connected"]').forEach((el) => {
    el.hidden = !gateOk;
  });
}

function showView(view) {
  const next = VIEWS.includes(view) ? view : 'connect';
  state.activeView = next;
  document.getElementById('screenTrack').style.transform = `translateX(-${VIEWS.indexOf(next) * 100}%)`;
  document.querySelectorAll('.view[data-view]').forEach((el) => {
    const active = el.dataset.view === next;
    el.classList.toggle('is-active', active);
    el.inert = !active;
    el.setAttribute('aria-hidden', String(!active));
  });
  document.querySelectorAll('[data-nav-view]').forEach((el) => {
    const active = el.getAttribute('data-nav-view') === next;
    el.classList.toggle('is-active', active);
    if (active) el.setAttribute('aria-current', 'step');
    else el.removeAttribute('aria-current');
  });
  syncGuideAndModuleUi();
}

function simFirmwareDisplayName() {
  if (!state.simFirmwarePath) return '';
  const parts = state.simFirmwarePath.split(/[\\/]/);
  return parts[parts.length - 1] || state.simFirmwarePath;
}

function updateSimFirmwarePreview() {
  const name = simFirmwareDisplayName();
  refs.simFirmwareBtn.textContent = name || SIM_FIRMWARE_BTN_LABEL;
  refs.simFirmwareBtn.title = state.simFirmwarePath || '';
  syncGuideAndModuleUi();
}

function formatOadElapsedLog(elapsedMs, outcomeLabel) {
  const ms = Math.max(0, Math.round(Number(elapsedMs) || 0));
  return `download: total elapsed ${(ms / 1000).toFixed(2)}s (${ms} ms) - ${outcomeLabel}`;
}

const SIM_OAD_OUTCOME_ANIM_MS = 1400;

function setSimOadProgress(progress) {
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  const pctStr = pct.toFixed(1);
  refs.simOadProgressText.textContent = `${pctStr}%`;
  refs.simOadProgressBar.style.width = `${pct}%`;
}

function resetSimOadProgress() {
  clearSimOadOutcomeAnimation();
  setSimOadProgress(0);
}

function clearSimOadOutcomeAnimation() {
  const track = refs.simOadProgressTrack;
  const bar = refs.simOadProgressBar;
  const text = refs.simOadProgressText;
  if (track) track.classList.remove('is-success', 'is-failure', 'is-animating');
  if (bar) bar.classList.remove('is-success', 'is-failure');
  if (text) text.classList.remove('is-success', 'is-failure');
  state.simOadOutcomeAnimating = false;
}

function playSimOadOutcomeAnimation(outcome) {
  const track = refs.simOadProgressTrack;
  const bar = refs.simOadProgressBar;
  const text = refs.simOadProgressText;
  if (!track || !bar) return Promise.resolve();

  clearSimOadOutcomeAnimation();
  state.simOadOutcomeAnimating = true;
  const isSuccess = outcome === 'success';
  void track.offsetWidth;
  track.classList.add('is-animating', isSuccess ? 'is-success' : 'is-failure');
  bar.classList.add(isSuccess ? 'is-success' : 'is-failure');
  if (text) {
    text.textContent = isSuccess ? 'OK' : 'FAIL';
    text.classList.add(isSuccess ? 'is-success' : 'is-failure');
  }

  return new Promise((resolve) => {
    window.setTimeout(() => {
      clearSimOadOutcomeAnimation();
      setSimOadProgress(0);
      resolve();
    }, SIM_OAD_OUTCOME_ANIM_MS);
  });
}

function setSimOadBusy(busy) {
  state.simOadBusy = busy;
  updateActionButtons();
}

/** List caption: prefer MAC/address; middle ellipsis when long. */
function deviceListAddressText(device) {
  const raw = String((device && (device.mac || device.id)) || '').trim();
  if (!raw) return '—';
  if (raw.length <= 20) return raw;
  return `${raw.slice(0, 8)}...${raw.slice(-6)}`;
}

function compactDeviceId(device) {
  const id = String((device && (device.mac || device.id)) || '');
  if (id.length <= 18) return id;
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

function batteryIconClass(level) {
  if (level == null || level === '') return 'battery-empty';
  const value = Number(level);
  if (!Number.isFinite(value)) return 'battery-empty';
  if (value === -1) return 'battery-charging';
  if (value <= 20) return 'battery-low';
  if (value <= 60) return 'battery-mid';
  return 'battery-good';
}

function renderBatteryIndicatorFor(target, level) {
  if (!target) return;
  if (level == null || level === '') {
    const emptyLabel = target.querySelector('.battery-label');
    target.className = 'battery-indicator battery-empty hidden';
    target.style.setProperty('--battery-level', '0%');
    if (emptyLabel) emptyLabel.textContent = '--';
    target.setAttribute('aria-label', 'Battery unknown');
    return;
  }
  const value = Number(level);
  const label = target.querySelector('.battery-label');

  if (!Number.isFinite(value)) {
    target.className = 'battery-indicator battery-empty hidden';
    target.style.setProperty('--battery-level', '0%');
    if (label) label.textContent = '--';
    target.setAttribute('aria-label', 'Battery unknown');
    return;
  }

  target.className = `battery-indicator ${batteryIconClass(level)}`;
  if (value === -1) {
    target.style.setProperty('--battery-level', '100%');
    if (label) label.textContent = '⚡';
    target.setAttribute('aria-label', 'Charging');
    return;
  }

  const pct = Math.max(0, Math.min(100, Math.round(value)));
  target.style.setProperty('--battery-level', `${pct}%`);
  if (label) label.textContent = String(pct);
  target.setAttribute('aria-label', `Battery ${pct}%`);
}

function renderBatteryIndicator(level) {
  renderBatteryIndicatorFor(refs.simTargetBattery, level);
}

function renderDeviceStatus(status) {
  const target = refs.simDeviceStatus;
  if (!target) return;
  const screenEl = target.querySelector('.device-status-screen');
  const detailEl = target.querySelector('.device-status-detail');
  const flagsEl = target.querySelector('.device-status-flags');
  if (!status) {
    target.classList.add('is-empty');
    if (screenEl) screenEl.textContent = '--';
    if (detailEl) detailEl.textContent = '-- / --';
    if (flagsEl) flagsEl.textContent = 'FLAGS --';
    target.title = 'FEE5 status unavailable';
    return;
  }
  const screen = status.screenName || `SCREEN_${status.screen}`;
  const phase = status.phaseName || `PHASE_${status.phase}`;
  const mode = status.modeName || `MODE_${status.mode}`;
  const profileNames = ['KITCHEN', 'AMERICANO', 'POUROVER', 'DIET'];
  const profileValue = status.coffee ? Number(status.coffee.profile) : -1;
  const profile = profileNames[profileValue] || null;
  const flagNames = Array.isArray(status.flagNames) ? status.flagNames : [];
  const flagHex = `0x${(Number(status.flags) >>> 0).toString(16).padStart(8, '0').toUpperCase()}`;
  target.classList.remove('is-empty');
  if (screenEl) screenEl.textContent = screen;
  if (detailEl) {
    detailEl.textContent = `${phase} / ${mode}${profile ? ` · ${profile}` : ''}`;
  }
  if (flagsEl) {
    flagsEl.textContent = `FLAGS ${flagHex}${flagNames.length ? ` · ${flagNames.join(', ')}` : ''}`;
  }
  target.title = `FEE5 length=${status.length} screen=${screen} phase=${phase} mode=${mode}${profile ? ` profile=${profile}` : ''} flags=${flagHex}`;
}

function deviceMetaText(device) {
  const rssi = device && device.rssi == null ? '-' : `${device.rssi} dBm`;
  const id = compactDeviceId(device);
  const product = device && device.advProductLabel ? device.advProductLabel : '—';
  const parts = [];
  if (id) parts.push(`ID ${id}`);
  parts.push(`Product ${product}`);
  parts.push(`RSSI ${rssi}`);
  return parts.join(' · ');
}

function deviceBindState(device) {
  return device && device.bindState === 'bound' ? 'bound' : 'unbind';
}

function renderSelectedDeviceSummary(device) {
  if (!device) {
    refs.simTargetName.textContent = 'No device';
    renderBatteryIndicator(null);
    renderDeviceStatus(null);
    return;
  }

  const name = device.name || 'Unnamed device';
  const meta = deviceMetaText(device);
  const firmware = device.firmware || 'Unknown';
  refs.simTargetName.textContent = name;
  renderBatteryIndicator(device.batteryLevel);
  renderDeviceStatus(device.deviceStatus);
}

function stopDeviceTimeTick() {
  if (state.deviceTimeTickTimer != null) {
    clearInterval(state.deviceTimeTickTimer);
    state.deviceTimeTickTimer = null;
  }
}

function clearDeviceTimeDisplay() {
  stopDeviceTimeTick();
  state.deviceTimeSampleUnix = null;
  state.deviceTimeSampleWallMs = null;
}

function renderDeviceTimeFromState() {
  if (
    !state.connected ||
    state.deviceTimeSampleUnix == null ||
    state.deviceTimeSampleWallMs == null
  ) {
    return;
  }
  const elapsedSec = Math.floor((Date.now() - state.deviceTimeSampleWallMs) / 1000);
  const displayUnix = (state.deviceTimeSampleUnix + elapsedSec) >>> 0;
  const text = formatLocalDateTime(new Date(displayUnix * 1000));
}

function startDeviceTimeTick() {
  stopDeviceTimeTick();

}

/**
 * @param {number | null | undefined} unixFromConnect
 */
async function syncDeviceWallClockFromGatt(unixFromConnect) {
  let u = unixFromConnect;
  if (u == null || !Number.isFinite(Number(u))) {
    try {
      const r = await window.mfgApi.readDeviceTime();
      if (r.ok && r.unixSeconds != null) u = r.unixSeconds;
    } catch (error) {
      pushLog(formatFailureMessage('Read device time failed: ', error.message || String(error)));
    }
  }
  if (u != null && Number.isFinite(Number(u))) {
    state.deviceTimeSampleUnix = Number(u) >>> 0;
    state.deviceTimeSampleWallMs = Date.now();
    renderDeviceTimeFromState();
    startDeviceTimeTick();
  } else {
    pushLog('Failed to read device time');
  }
}

function sortDevicesInPlace() {
  state.devices.sort((a, b) => {
    const ka = String(a.mac || a.id || '').toLowerCase();
    const kb = String(b.mac || b.id || '').toLowerCase();
    return ka.localeCompare(kb);
  });
}

function upsertDevices(devices) {
  const byId = new Map(state.devices.map((device) => [device.id, device]));
  for (const device of devices) {
    const previous = byId.get(device.id);
    byId.set(device.id, {
      ...device,
      firmware: device.firmware ?? (previous && previous.firmware),
      batteryLevel:
        device.batteryLevel == null && previous
          ? previous.batteryLevel
          : device.batteryLevel,
      scaleReading:
        device.scaleReading == null && previous
          ? previous.scaleReading
          : device.scaleReading,
      deviceStatus:
        device.deviceStatus == null && previous
          ? previous.deviceStatus
          : device.deviceStatus,
    });
  }
  state.devices = [...byId.values()];
  sortDevicesInPlace();
  syncSelectionAfterDeviceListChange();
}

function removeDevices(ids) {
  const removeSet = new Set(ids);
  state.devices = state.devices.filter((device) => !removeSet.has(device.id));
  for (const id of removeSet) {
    const card = state.deviceCards.get(id);
    if (card) card.remove();
    state.deviceCards.delete(id);
  }
  state.deviceOrder = state.devices.map((device) => device.id).join('|');
  if (state.selectedDevice && removeSet.has(state.selectedDevice.id)) {
    clearSelectedDevice();
  }
}

function resetDeviceList() {
  state.devices = [];
  for (const card of state.deviceCards.values()) {
    card.remove();
  }
  state.deviceCards.clear();
  state.deviceOrder = '';
  clearSelectedDevice();
}

function renderScaleDisplay(reading) {
  const formatted = reading || { valueText: '--', unitText: '' };
  const valueText = formatted.valueText || '--';
  if (refs.simScaleValue) refs.simScaleValue.textContent = valueText;
  if (refs.simScaleUnit) refs.simScaleUnit.textContent = formatted.unitText || '';
}

const WEIGHING_PROFILE_KITCHEN = 0;
const WEIGHING_PROFILE_DIET = 3;
function isPlainWeighingProfile(mode) {
  return mode === WEIGHING_PROFILE_KITCHEN || mode === WEIGHING_PROFILE_DIET;
}
const COFFEE_MODE_ESPRESSO = 1;
const COFFEE_MODE_POUR_OVER = 2;
const COFFEE_FLAG_CONFIGURED = 1 << 8;
const COFFEE_FLAG_ACTIVE = 1 << 9;
const COFFEE_FLAG_DIRTY = 1 << 13;
const COFFEE_MAX_TARGET_MG = 999900;
const MG_PER_OZ = 28349.523125;

function coffeeUnit() {
  return state.scaleReading && Number(state.scaleReading.unit) === 1 ? 'oz' : 'g';
}

function coffeeDisplayMass(mg) {
  return coffeeUnit() === 'oz' ? Number(mg) / MG_PER_OZ : Number(mg) / 1000;
}

function coffeeDisplayMassText(mg) {
  const unit = coffeeUnit();
  return `${coffeeDisplayMass(mg).toFixed(unit === 'oz' ? 2 : 1)} ${unit}`;
}

function coffeeReadingMg() {
  const reading = state.scaleReading;
  if (!reading || !Number.isFinite(Number(reading.value))) return 0;
  return Number(reading.unit) === 1
    ? Math.round(Number(reading.value) * (MG_PER_OZ / 100))
    : Math.max(0, Number(reading.value));
}

function setCoffeeSyncState(text, kind = '') {
  if (!refs.simCoffeeSyncState) return;
  refs.simCoffeeSyncState.textContent = text;
  refs.simCoffeeSyncState.classList.toggle('is-saved', kind === 'saved');
  refs.simCoffeeSyncState.classList.toggle('is-error', kind === 'error');
}

function coffeeModeDefaults(mode) {
  if (Number(mode) === COFFEE_MODE_ESPRESSO) {
    return { baseMg: 36000, ratio: 2 };
  }
  return { baseMg: 15000, ratio: 16 };
}

function saveCoffeeDraft(mode = state.coffee.mode) {
  if (mode !== COFFEE_MODE_ESPRESSO && mode !== COFFEE_MODE_POUR_OVER) return;
  state.coffee.drafts[mode] = {
    baseMg: state.coffee.baseMg,
    ratio: state.coffee.ratio,
    primaryTargetMg: state.coffee.primaryTargetMg,
    waterTargetMg: state.coffee.waterTargetMg,
  };
}

function loadCoffeeDraft(mode) {
  const draft = state.coffee.drafts[mode];
  if (!draft) {
    const defaults = coffeeModeDefaults(mode);
    state.coffee.baseMg = defaults.baseMg;
    state.coffee.ratio = defaults.ratio;
    updateCoffeeTargetsFromInputs();
    saveCoffeeDraft(mode);
    return;
  }
  state.coffee.baseMg = draft.baseMg;
  state.coffee.ratio = draft.ratio;
  state.coffee.primaryTargetMg = draft.primaryTargetMg;
  state.coffee.waterTargetMg = draft.waterTargetMg;
}

function configureCoffeeControlRanges() {
  const pourOver = state.coffee.mode === COFFEE_MODE_POUR_OVER;
  const unit = coffeeUnit();
  const minMg = pourOver ? 5000 : 10000;
  const ratio = Number(state.coffee.ratio);
  const modeMaxMg = pourOver ? 60000 : 100000;
  const maxMg = Math.min(
    modeMaxMg,
    Math.floor(COFFEE_MAX_TARGET_MG / ratio / 100) * 100
  );
  const min = unit === 'oz' ? minMg / MG_PER_OZ : minMg / 1000;
  const max = unit === 'oz' ? maxMg / MG_PER_OZ : maxMg / 1000;
  const step = unit === 'oz' ? 0.01 : 0.1;
  for (const input of [refs.simCoffeeBaseRange, refs.simCoffeeBaseInput]) {
    if (!input) continue;
    input.min = String(Number(min.toFixed(unit === 'oz' ? 2 : 1)));
    input.max = String(Number(max.toFixed(unit === 'oz' ? 2 : 1)));
    input.step = String(step);
  }
  if (refs.simCoffeeRatioRange) {
    refs.simCoffeeRatioRange.min = pourOver ? '10' : '1';
    refs.simCoffeeRatioRange.max = pourOver ? '20' : '4';
    refs.simCoffeeRatioRange.step = '0.1';
  }
}

function updateCoffeeTargetsFromInputs() {
  const ratio = Number(state.coffee.ratio);
  const maxPrimary = Math.floor(COFFEE_MAX_TARGET_MG / ratio / 100) * 100;
  const primary = Math.min(
    COFFEE_MAX_TARGET_MG,
    maxPrimary,
    Math.max(1, Math.round(state.coffee.baseMg))
  );
  const water = Math.min(
    COFFEE_MAX_TARGET_MG,
    Math.max(1, Math.round(primary * ratio))
  );
  state.coffee.baseMg = primary;
  state.coffee.primaryTargetMg = primary;
  state.coffee.waterTargetMg = water;
}

function renderCoffeeProgress() {
  const statusCoffee = state.deviceStatus && state.deviceStatus.coffee;
  const active =
    state.deviceStatus && (Number(state.deviceStatus.flags) & COFFEE_FLAG_ACTIVE) !== 0;
  const stage = active && statusCoffee ? Number(statusCoffee.stage) : 0;
  const weightMg = coffeeReadingMg();
  const primaryTarget = Math.max(1, state.coffee.primaryTargetMg);
  const waterTarget = Math.max(1, state.coffee.waterTargetMg);
  const primaryProgress = stage === 2 ? 1 : stage === 1 ? Math.min(1, weightMg / primaryTarget) : 0;
  const waterProgress = stage === 2 ? Math.min(1, weightMg / waterTarget) : 0;

  if (refs.simCoffeePrimaryProgress) {
    refs.simCoffeePrimaryProgress.style.flexGrow = String(primaryTarget);
    refs.simCoffeePrimaryProgress.style.setProperty(
      '--coffee-progress',
      `${(primaryProgress * 100).toFixed(1)}%`
    );
    refs.simCoffeePrimaryProgress.classList.toggle(
      'is-reached',
      stage === 1 && weightMg >= primaryTarget
    );
    refs.simCoffeePrimaryProgress.classList.toggle(
      'is-overrun',
      stage === 1 && weightMg > primaryTarget + 500
    );
  }
  if (refs.simCoffeeWaterProgress) {
    refs.simCoffeeWaterProgress.style.flexGrow = String(waterTarget);
    refs.simCoffeeWaterProgress.style.setProperty(
      '--coffee-progress',
      `${(waterProgress * 100).toFixed(1)}%`
    );
    refs.simCoffeeWaterProgress.classList.toggle(
      'is-reached',
      stage === 2 && weightMg >= waterTarget
    );
    refs.simCoffeeWaterProgress.classList.toggle(
      'is-overrun',
      stage === 2 && weightMg > waterTarget + 500
    );
  }
}

function renderCoffeeControls() {
  refs.simContainerFields.hidden = state.coffee.mode !== 3;
  const scaleProfile = isPlainWeighingProfile(state.coffee.mode);
  const pourOver = state.coffee.mode === COFFEE_MODE_POUR_OVER;
  const unit = coffeeUnit();
  const baseDisplay = coffeeDisplayMass(state.coffee.baseMg);
  const digits = unit === 'oz' ? 2 : 1;

  configureCoffeeControlRanges();
  if (refs.simCoffeeModeSelect) {
    refs.simCoffeeModeSelect.value = String(state.coffee.mode);
    refs.simCoffeeModeSelect.dispatchEvent(new Event('mode-render'));
  }
  if (refs.simCoffeeRecipeFields) refs.simCoffeeRecipeFields.hidden = scaleProfile;
  if (scaleProfile) {
    renderCoffeeProgress();
    return;
  }
  if (refs.simCoffeeBaseLabel) {
    refs.simCoffeeBaseLabel.textContent = pourOver ? 'Coffee grounds' : 'Espresso liquid';
  }
  if (refs.simCoffeePrimaryName) {
    refs.simCoffeePrimaryName.textContent = pourOver ? 'Grounds' : 'Espresso';
  }
  if (refs.simCoffeeRatioLabel) {
    refs.simCoffeeRatioLabel.textContent = pourOver ? 'Water : grounds' : 'Water : espresso';
  }
  if (refs.simCoffeeBaseUnit) refs.simCoffeeBaseUnit.textContent = unit;
  if (refs.simCoffeeBaseRange) refs.simCoffeeBaseRange.value = baseDisplay.toFixed(digits);
  if (refs.simCoffeeBaseInput) refs.simCoffeeBaseInput.value = baseDisplay.toFixed(digits);
  if (refs.simCoffeeRatioRange) refs.simCoffeeRatioRange.value = String(state.coffee.ratio);
  if (refs.simCoffeeRatioValue) refs.simCoffeeRatioValue.value = Number(state.coffee.ratio).toFixed(1);
  if (refs.simCoffeePrimaryTarget) {
    refs.simCoffeePrimaryTarget.textContent = coffeeDisplayMassText(state.coffee.primaryTargetMg);
  }
  if (refs.simCoffeeWaterTarget) {
    refs.simCoffeeWaterTarget.textContent = coffeeDisplayMassText(state.coffee.waterTargetMg);
  }
  renderCoffeeProgress();
}

function hydrateCoffeeFromStatus(status) {
  const coffee = status && status.coffee;
  const configured = status && (Number(status.flags) & COFFEE_FLAG_CONFIGURED) !== 0;
  const schema = coffee ? Number(coffee.schema) : 0;
  const mode = coffee ? Number(coffee.mode) : WEIGHING_PROFILE_DIET;
  const validProfile =
    coffee &&
    (isPlainWeighingProfile(mode) ||
      mode === COFFEE_MODE_ESPRESSO ||
      mode === COFFEE_MODE_POUR_OVER);
  if (
    coffee &&
    (schema === 1 || schema === 2) &&
    validProfile &&
    !state.coffee.profileSendInFlight &&
    !coffeeHasUnsentLocalChange()
  ) {
    state.coffee.mode = mode;
    renderCoffeeControls();
    if (isPlainWeighingProfile(mode)) {
      state.coffee.hydrated = true;
      setCoffeeSyncState('SAVED', 'saved');
      renderCoffeeControls();
      return;
    }
  }
  if (
    !coffee ||
    (schema !== 1 && schema !== 2) ||
    isPlainWeighingProfile(mode) ||
    !validProfile ||
    !configured ||
    coffee.primaryTargetMg <= 0 ||
    coffee.waterTargetMg <= 0
  ) {
    return;
  }
  if (
    !state.coffee.hydrated &&
    !state.coffee.sendInFlight &&
    !coffeeHasUnsentLocalChange()
  ) {
    state.coffee.mode = Number(coffee.mode);
    state.coffee.baseMg = Number(coffee.primaryTargetMg);
    state.coffee.ratio = Number(coffee.waterTargetMg) / Number(coffee.primaryTargetMg);
    state.coffee.primaryTargetMg = Number(coffee.primaryTargetMg);
    state.coffee.waterTargetMg = Number(coffee.waterTargetMg);
    saveCoffeeDraft(state.coffee.mode);
    state.coffee.hydrated = true;
  }
  if (!coffeeHasUnsentLocalChange()) {
    if ((Number(status.flags) & COFFEE_FLAG_DIRTY) !== 0) {
      setCoffeeSyncState('PREVIEW');
    } else {
      setCoffeeSyncState('SAVED', 'saved');
    }
  }
  renderCoffeeControls();
}

function coffeeRecipePayload(persist) {
  return {
    mode: state.coffee.mode,
    primaryTargetMg: state.coffee.primaryTargetMg,
    waterTargetMg: state.coffee.waterTargetMg,
    persist: Boolean(persist),
  };
}

function coffeeStatusConfirmsCurrent() {
  const status = state.deviceStatus;
  const coffee = status && status.coffee;
  if (!coffee || (Number(status.flags) & COFFEE_FLAG_CONFIGURED) === 0) return false;
  return (
    (Number(status.flags) & COFFEE_FLAG_DIRTY) === 0 &&
    Number(coffee.mode) === state.coffee.mode &&
    Number(coffee.primaryTargetMg) === state.coffee.primaryTargetMg &&
    Number(coffee.waterTargetMg) === state.coffee.waterTargetMg
  );
}

function coffeeHasUnsentLocalChange() {
  return (
    state.coffee.previewTimer != null ||
    state.coffee.commitTimer != null ||
    state.coffee.pendingSend != null
  );
}

async function drainCoffeeRecipeSendQueue() {
  if (state.coffee.sendInFlight || !state.connected) return;
  state.coffee.sendInFlight = true;
  try {
    while (state.coffee.pendingSend && state.connected) {
      const next = state.coffee.pendingSend;
      state.coffee.pendingSend = null;
      setCoffeeSyncState(next.persist ? 'SAVING' : 'PREVIEW');
      const result = await window.mfgApi.scaleSetCoffeeRecipe(next);
      if (!result || !result.ok) {
        throw new Error((result && result.message) || 'Coffee recipe write failed');
      }
      if (next.persist) {
        setCoffeeSyncState(
          coffeeStatusConfirmsCurrent() ? 'SAVED' : 'WAIT STATUS',
          coffeeStatusConfirmsCurrent() ? 'saved' : ''
        );
      }
    }
  } catch (error) {
    setCoffeeSyncState('ERROR', 'error');
    pushSimLog(formatFailureMessage('Coffee recipe failed: ', error.message || String(error)));
  } finally {
    state.coffee.sendInFlight = false;
    if (state.coffee.pendingSend && state.connected) void drainCoffeeRecipeSendQueue();
    updateActionButtons();
  }
}

function enqueueCoffeeRecipe(persist) {
  if (!state.connected || isPlainWeighingProfile(state.coffee.mode)) return;
  const next = coffeeRecipePayload(persist);
  state.coffee.pendingSend = next;
  void drainCoffeeRecipeSendQueue();
}

function scheduleCoffeeRecipePreview() {
  if (isPlainWeighingProfile(state.coffee.mode)) return;
  setCoffeeSyncState('LOCAL');
  if (state.coffee.previewTimer == null) {
    state.coffee.previewTimer = setTimeout(() => {
      state.coffee.previewTimer = null;
      enqueueCoffeeRecipe(false);
    }, 100);
  }
  if (state.coffee.commitTimer != null) clearTimeout(state.coffee.commitTimer);
  state.coffee.commitTimer = setTimeout(() => {
    state.coffee.commitTimer = null;
    enqueueCoffeeRecipe(true);
    updateActionButtons();
  }, 450);
  updateActionButtons();
}

function commitCoffeeRecipeNow() {
  if (isPlainWeighingProfile(state.coffee.mode)) return;
  if (state.coffee.previewTimer != null) {
    clearTimeout(state.coffee.previewTimer);
    state.coffee.previewTimer = null;
    enqueueCoffeeRecipe(false);
  }
  if (state.coffee.commitTimer != null) {
    clearTimeout(state.coffee.commitTimer);
    state.coffee.commitTimer = null;
  }
  enqueueCoffeeRecipe(true);
  updateActionButtons();
}

async function persistWeighingProfile() {
  if (!state.connected || state.coffee.profileSendInFlight) return;
  state.coffee.profileSendInFlight = true;
  setCoffeeSyncState('SAVING PROFILE');
  updateActionButtons();
  try {
    const scaleProfile = isPlainWeighingProfile(state.coffee.mode);
    const result = await window.mfgApi.scaleSetWeighingProfile({
      profile: state.coffee.mode,
      primaryTargetMg: scaleProfile ? 0 : state.coffee.primaryTargetMg,
      waterTargetMg: scaleProfile ? 0 : state.coffee.waterTargetMg,
    });
    if (!result || !result.ok) {
      throw new Error((result && result.message) || 'Scale mode write failed');
    }
    state.coffee.hydrated = true;
    setCoffeeSyncState('SAVED · NEXT ENTRY', 'saved');
    pushSimLog(result.message);
  } catch (error) {
    setCoffeeSyncState('ERROR', 'error');
    pushSimLog(
      formatFailureMessage('Scale mode failed: ', error.message || String(error))
    );
  } finally {
    state.coffee.profileSendInFlight = false;
    updateActionButtons();
  }
}

function clearScaleDisplay() {
  state.scaleReading = null;
  renderScaleDisplay(null);
  renderCoffeeControls();
}

function clearDeviceStatus() {
  if (state.coffee.previewTimer != null) clearTimeout(state.coffee.previewTimer);
  if (state.coffee.commitTimer != null) clearTimeout(state.coffee.commitTimer);
  state.coffee.previewTimer = null;
  state.coffee.commitTimer = null;
  state.coffee.pendingSend = null;
  state.coffee.mode = WEIGHING_PROFILE_DIET;
  state.coffee.baseMg = 15000;
  state.coffee.ratio = 16;
  state.coffee.primaryTargetMg = 15000;
  state.coffee.waterTargetMg = 240000;
  state.coffee.profileSendInFlight = false;
  state.coffee.drafts = {
    [COFFEE_MODE_ESPRESSO]: {
      baseMg: 36000,
      ratio: 2,
      primaryTargetMg: 36000,
      waterTargetMg: 72000,
    },
    [COFFEE_MODE_POUR_OVER]: {
      baseMg: 15000,
      ratio: 16,
      primaryTargetMg: 15000,
      waterTargetMg: 240000,
    },
  };
  state.deviceStatus = null;
  renderDeviceStatus(null);
  state.coffee.hydrated = false;
  setCoffeeSyncState('LOCAL');
  renderCoffeeControls();
}

function applyDeviceStatus(status) {
  if (!status) return;
  state.deviceStatus = status;
  renderDeviceStatus(status);
  hydrateCoffeeFromStatus(status);
  renderCoffeeProgress();
}

function applyScaleReading(reading) {
  if (!reading) return;
  const previousUnit = state.scaleReading ? state.scaleReading.unit : null;
  const unitInput = document.getElementById("deviceUnitValue");
  if ([0, 1].includes(reading.unit)) {
    unitInput.value = String(reading.unit);
    unitInput.dispatchEvent(new Event("unit-render"));
  }
  state.scaleReading = reading;
  renderScaleDisplay(reading);
  if (previousUnit !== reading.unit) renderCoffeeControls();
  else renderCoffeeProgress();
}

function scaleDeviceIdCandidates(device) {
  if (!device) return [];
  const ids = new Set();
  const push = (value) => {
    const text = String(value || '').trim().toLowerCase();
    if (text) ids.add(text);
  };
  push(device.id);
  push(device.mac);
  const name = String(device.name || '').trim();
  if (name) push(`name:${name.toLowerCase()}`);
  return [...ids];
}

function applyScaleUpdatePayload({ deviceId, deviceKey, reading }) {
  if (!reading) return;
  if (!state.connected && !state.connecting) return;
  applyScaleReading(reading);
  const matchIds = new Set(
    [deviceId, deviceKey]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  );
  state.devices = state.devices.map((device) => {
    const candidates = scaleDeviceIdCandidates(device);
    if (matchIds.size > 0 && !candidates.some((id) => matchIds.has(id))) return device;
    return { ...device, scaleReading: reading };
  });
  if (state.selectedDevice) {
    state.selectedDevice = {
      ...state.selectedDevice,
      scaleReading: reading,
    };
  }
}

function updateActionButtons() {
  document.getElementById('historyFields').disabled = state.kcalHistBusy || state.morphThemeBusy || state.actionBusy;
  const canOperate = Boolean(state.selectedDevice && state.connected && !state.connecting && !state.morphThemeBusy && !state.actionBusy);
  const isBound = deviceBindState(state.selectedDevice) === 'bound';
  document.getElementById('deviceUnitValue').disabled = !canOperate || state.simOadBusy;
  refs.simContainerSet.disabled = refs.simContainerClear.disabled =
    !canOperate || !isBound || state.simOadBusy || state.containerBusy;
  refs.simContainerWeight.disabled = state.containerBusy;
  if (!state.connected) refs.simContainerStatus.textContent = '';
  for (const control of [
    refs.simCoffeeBaseRange,
    refs.simCoffeeBaseInput,
    refs.simCoffeeRatioRange,
    refs.simCoffeeApplyBtn,
  ]) {
    if (control) {
      control.disabled =
        !canOperate || state.simOadBusy || state.coffee.profileSendInFlight;
    }
  }
  if (refs.simCoffeeModeSelect) {
    refs.simCoffeeModeSelect.disabled =
      !canOperate ||
      state.simOadBusy ||
      state.coffee.profileSendInFlight ||
      state.coffee.sendInFlight ||
      coffeeHasUnsentLocalChange();
  }
  refs.simKcalUpdateBtn.disabled = !canOperate || state.simOadBusy || state.kcalHistBusy;
  refs.simNotifyBtn.disabled = !canOperate || state.simOadBusy || state.kcalHistBusy;
  refs.simAppendKcalBtn.disabled = !canOperate || state.simOadBusy || state.kcalHistBusy || state.morphThemeBusy;
  if (refs.factoryBtn) refs.factoryBtn.disabled = !canOperate || state.simOadBusy || state.kcalHistBusy || state.morphThemeBusy;
  refs.simBindBtn.disabled =
    !canOperate ||
    state.simOadBusy ||
    state.kcalHistBusy ||
    state.morphThemeBusy;
  if (refs.simResetBtn) refs.simResetBtn.disabled = !canOperate || state.simOadBusy || state.kcalHistBusy || state.morphThemeBusy;
  refs.simOadBtn.disabled =
    !canOperate || state.simOadBusy || state.kcalHistBusy || state.morphThemeBusy || !state.simFirmwarePath;
  refs.simFirmwareBtn.disabled = state.simOadBusy || state.kcalHistBusy || state.morphThemeBusy;
  if (refs.simHistFoodTrigger) {
    refs.simHistFoodTrigger.disabled = state.kcalHistBusy || state.morphThemeBusy;
  }
  if (refs.simHistKcalInput) refs.simHistKcalInput.disabled = state.kcalHistBusy || state.morphThemeBusy;
  if (refs.simHistWeightInput) refs.simHistWeightInput.disabled = state.kcalHistBusy || state.morphThemeBusy;
  if (refs.simHistUnitSelect) refs.simHistUnitSelect.disabled = state.kcalHistBusy || state.morphThemeBusy;
  if (refs.simNotifyColorInput) refs.simNotifyColorInput.disabled = state.kcalHistBusy || state.morphThemeBusy;
  if (refs.simNotifyTextInput) refs.simNotifyTextInput.disabled = state.kcalHistBusy || state.morphThemeBusy;
  syncGuideAndModuleUi();
}

function selectDevice(device) {
  state.selectedDevice = device;
  renderSelectedDeviceSummary(device);
  if (!state.connected) {
    clearDeviceTimeDisplay();
  }
  updateActionButtons();
  pushLog(`Selected ${device.name}`);
}

function clearBatteryDisplay() {
  if (state.selectedDevice) {
    state.selectedDevice = {
      ...state.selectedDevice,
      batteryLevel: null,
    };
    renderSelectedDeviceSummary(state.selectedDevice);
  }
}

function clearSelectedDevice() {
  state.selectedDevice = null;
  state.connected = false;
  renderSelectedDeviceSummary(null);
  clearDeviceTimeDisplay();
  clearScaleDisplay();
  clearDeviceStatus();
  updateActionButtons();
  renderConnection();
}

function renderConnection() {
  if (state.connecting) {
    refs.simStateText.textContent = 'Connecting';
    refs.simStateLed.classList.remove('connected');
    refs.simBindBtn.classList.remove('visible');
    refs.simResetBtn.classList.remove('visible');
    refs.factoryBtn.classList.remove('visible');
    syncGuideAndModuleUi();
    return;
  }

  const text = state.connected ? 'Connected' : 'Idle';
  refs.simStateText.textContent = text;
  refs.simStateLed.classList.toggle('connected', state.connected);
  refs.simBindBtn.classList.toggle('visible', state.connected);
  refs.simResetBtn.classList.toggle('visible', state.connected);
  refs.factoryBtn.classList.toggle('visible', state.connected);
  syncGuideAndModuleUi();
}

function setPanelBusy(busy) {
  const host = refs.connectBusyHost || refs.simMainPanel;
  if (host) host.classList.toggle('busy', busy);
  if (refs.simActionPanel) refs.simActionPanel.classList.toggle('busy', busy);
}

async function selectAndConnectDevice(device) {
  if (state.connecting) return;
  if (state.connected && state.selectedDevice?.id === device.id) {
    selectDevice(device);
    pushLog(`${device.name || device.mac}  already connected, skip`);
    return;
  }
  selectDevice(device);
  clearDeviceTimeDisplay();
  clearScaleDisplay();
  clearDeviceStatus();
  const attemptSeq = ++state.connectAttemptSeq;
  state.connecting = true;
  setPanelBusy(true);
  pushLog(`Connecting ${device.name || device.mac}`);
  renderConnection();

  try {
    const result = await window.mfgApi.connect(device);
    if (attemptSeq !== state.connectAttemptSeq) return;
    if (!result.ok) {
      state.connected = false;
      pushLog(formatFailureMessage('Connect failed: ', result.message));
      return;
    }

    state.connected = result.state === 'connected';
    const connectedDevice = result.device || {};
    state.selectedDevice = {
      ...state.selectedDevice,
      ...connectedDevice,
      firmware: result.firmware,
      batteryLevel:
        connectedDevice.batteryLevel == null
          ? state.selectedDevice.batteryLevel
          : connectedDevice.batteryLevel,
    };
    if (connectedDevice.scaleReading) {
      applyScaleReading(connectedDevice.scaleReading);
    }
    if (connectedDevice.deviceStatus) {
      applyDeviceStatus(connectedDevice.deviceStatus);
    }
    renderSelectedDeviceSummary(state.selectedDevice);
    pushLog(`Connected ${state.selectedDevice.name}`);
    if (result.timeSync && result.timeSync.ok) {
      const stamp = formatLocalDateTime(new Date(result.timeSync.unixSeconds * 1000));
      pushLog(`Device time synced to ${stamp}`);
    } else if (result.timeSync) {
      pushLog(formatFailureMessage('Device time sync failed: ', result.timeSync.message || 'unknown error'));
    }
    if (result.bleTimeEnabled !== false) {
      await syncDeviceWallClockFromGatt(result.deviceUnixSeconds);
    } else {
      clearDeviceTimeDisplay();
    }
  } catch (error) {
    if (attemptSeq !== state.connectAttemptSeq) return;
    state.connected = false;
    clearDeviceTimeDisplay();
    pushLog(formatFailureMessage('Connect failed: ', error.message));
  } finally {
    if (attemptSeq !== state.connectAttemptSeq) return;
    state.connecting = false;
    setPanelBusy(false);
    renderConnection();
    updateActionButtons();
      if (state.connected) {
      showView('test');
    }
  }
}

function registerBleIpcListeners() {
  window.mfgApi.onScanUpdate((devices) => {
    if (!devices) return;
    const previousById = new Map(state.devices.map((device) => [device.id, device]));
    state.devices = devices.map((device) => {
      const previous = previousById.get(device.id);
      return {
        ...device,
        batteryLevel:
          device.batteryLevel == null && previous
            ? previous.batteryLevel
            : device.batteryLevel,
        scaleReading:
          device.scaleReading == null && previous
            ? previous.scaleReading
            : device.scaleReading,
        deviceStatus:
          device.deviceStatus == null && previous
            ? previous.deviceStatus
            : device.deviceStatus,
      };
    });
    sortDevicesInPlace();
    syncSelectionAfterDeviceListChange();
    syncTabContentHeight();
  });
  window.mfgApi.onScanUpsert((devices) => {
    upsertDevices(devices);
    syncTabContentHeight();
  });
  window.mfgApi.onScanRemove((ids) => {
    removeDevices(ids);
    syncTabContentHeight();
  });
  window.mfgApi.onScanReset(() => {
    resetDeviceList();
    syncTabContentHeight();
  });
  window.mfgApi.onSessionIdle((payload) => {
    applySessionIdleUi(payload);
    syncTabContentHeight();
  });
  window.mfgApi.onConnectionLost((payload) => {
    const reason = payload && payload.reason ? payload.reason : 'unknown';
    if (reason === 'bind-complete' || reason === 'reset-complete' || reason === 'session-end') {
      return;
    }
    setSimOadBusy(false);
    applySessionIdleUi(payload);
    const msg = 'Bluetooth disconnected. Select the device again to reconnect.';
    pushLog(msg);
    syncTabContentHeight();
  });
  window.mfgApi.onScaleUpdate((payload) => {
    applyScaleUpdatePayload(payload || {});
  });
  window.mfgApi.onStatusUpdate(({ deviceId, status }) => {
    if (!status || !state.selectedDevice || state.selectedDevice.id !== deviceId) return;
    applyDeviceStatus(status);
    state.devices = state.devices.map((device) =>
      device.id === deviceId ? { ...device, deviceStatus: status } : device
    );
    state.selectedDevice = { ...state.selectedDevice, deviceStatus: status };
  });
}

registerBleIpcListeners();

async function boot() {
  renderCoffeeControls();
  const devices = await window.mfgApi.listDemoDevices();
  state.devices = devices;
  state.selectedDevice = devices[0] || null;
  renderConnection();

  if (state.selectedDevice) {
    selectDevice(state.selectedDevice);
  } else {
    clearSelectedDevice();
  }
  showView('connect');
  setLogDrawerOpen(false);
  await loadHistFoodImages();

}

async function refreshBleScanFromUi(button) {
  button.disabled = true;
  try {
    const selection = window.mfgApi.refreshScan();
    const result = await selection;
    if (!result.ok) { pushLog(formatFailureMessage('Scan failed: ', result.message)); return; }
    state.devices = await window.mfgApi.listDemoDevices();
      await selectAndConnectDevice(result.device);
  } catch (error) {
    pushLog(formatFailureMessage('Scan failed: ', error.message || String(error)));
  } finally { button.disabled = false; renderConnection(); }
}

refs.simRefreshScanBtn.addEventListener('click', () => {
  void refreshBleScanFromUi(refs.simRefreshScanBtn);
});

async function disconnectCurrentDevice() {
  if (!state.connected) return;
  clearSelectedDevice();
  pushLog('Disconnecting…');
  try {
    const result = await window.mfgApi.disconnect();
    pushLog(result.ok ? 'Disconnected' : formatFailureMessage('Disconnect failed: ', result.message));
  } catch (error) {
    pushLog(formatFailureMessage('Disconnect failed: ', error.message || String(error)));
  }
}

function setCoffeeBaseFromDisplay(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return;
  state.coffee.baseMg = Math.max(
    1,
    Math.round(value * (coffeeUnit() === 'oz' ? MG_PER_OZ : 1000))
  );
  updateCoffeeTargetsFromInputs();
  saveCoffeeDraft();
  renderCoffeeControls();
  scheduleCoffeeRecipePreview();
}

if (refs.simCoffeeModeSelect) {
  refs.simCoffeeModeSelect.addEventListener('change', () => {
    saveCoffeeDraft();
    state.coffee.mode = Number(refs.simCoffeeModeSelect.value);
    if (!isPlainWeighingProfile(state.coffee.mode)) {
      loadCoffeeDraft(state.coffee.mode);
    }
    renderCoffeeControls();
    void persistWeighingProfile();
  });
}

if (refs.simCoffeeBaseRange) {
  refs.simCoffeeBaseRange.addEventListener('input', () => {
    setCoffeeBaseFromDisplay(refs.simCoffeeBaseRange.value);
  });
  refs.simCoffeeBaseRange.addEventListener('change', commitCoffeeRecipeNow);
}

if (refs.simCoffeeBaseInput) {
  refs.simCoffeeBaseInput.addEventListener('input', () => {
    setCoffeeBaseFromDisplay(refs.simCoffeeBaseInput.value);
  });
  refs.simCoffeeBaseInput.addEventListener('change', commitCoffeeRecipeNow);
}

if (refs.simCoffeeRatioRange) {
  refs.simCoffeeRatioRange.addEventListener('input', () => {
    const ratio = Number(refs.simCoffeeRatioRange.value);
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    state.coffee.ratio = ratio;
    updateCoffeeTargetsFromInputs();
    saveCoffeeDraft();
    renderCoffeeControls();
    scheduleCoffeeRecipePreview();
  });
  refs.simCoffeeRatioRange.addEventListener('change', commitCoffeeRecipeNow);
}

if (refs.simCoffeeApplyBtn) {
  refs.simCoffeeApplyBtn.addEventListener('click', commitCoffeeRecipeNow);
}

function parseNotifyTextInput(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) {
    throw new Error('Notify text is required');
  }
  if ([...text].length > 64) {
    throw new Error('Notify text too long');
  }
  return text;
}

function rgb888HexToRgb565(hexColor) {
  const hex = String(hexColor || '').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error('Invalid notify color');
  }
  const value = Number.parseInt(hex, 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
}

function parseKcalInputValue(raw, label, min = 0) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) {
    throw new Error(`${label} is required`);
  }
  const n = Number(text);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > 9999) {
    throw new Error(`${label} must be an integer ${min}–9999`);
  }
  return n;
}

function parseHistKcalInput(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) {
    throw new Error('Kcal  is required');
  }
  const n = Number(text);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 4294967295) {
    throw new Error('Kcal must be a uint32 integer');
  }
  return n;
}

function parseHistWeightInput(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) {
    throw new Error('Weight is required');
  }
  const n = Number(text);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error('Weight must be an int32 integer');
  }
  if (n < -2147483648 || n > 2147483647) {
    throw new Error('Weight out of range');
  }
  return n;
}

function setKcalHistBusy(busy) {
  state.kcalHistBusy = Boolean(busy);
  updateActionButtons();
}

function setMorphThemeBusy(busy) {
  state.morphThemeBusy = Boolean(busy);
  updateActionButtons();
}

const HIST_FOOD_NO_IMAGE = '';

function histFoodLabel(fileName) {
  return String(fileName || '').replace(/\.png$/i, '');
}

function getSelectedHistFoodFile() {
  return document.getElementById('simHistPhoto1').value;
}

async function loadHistFoodImages() {
  let items=[];
  try {
    const result=await window.mfgApi.listFoodImages();
    if (!result.ok) throw new Error(result.message || 'Image list unavailable');
    items=await Promise.all(result.files.map(async file=>{
      const preview=await window.mfgApi.foodImagePreview(file);
      return {file,label:histFoodLabel(file),dataUrl:preview.ok?preview.dataUrl:null};
    }));
  } catch(error) { pushSimLog(`Food images unavailable: ${error.message}`); }
  renderHistoryControls([{file:'',label:'No image',dataUrl:null},...items]);
}

refs.simAppendKcalBtn.addEventListener('click', async () => {
  if (!state.connected) {
    pushSimLog('Append kcal failed: not connected');
    return;
  }
  let kcal;
  let weight;
  let unit;
  let foodFile;
  let noImage;
  try {
    kcal = parseHistKcalInput(refs.simHistKcalInput.value);
    weight = parseHistWeightInput(refs.simHistWeightInput.value);
    unit = refs.simHistUnitSelect.value;
    foodFile = getSelectedHistFoodFile();
    noImage = foodFile === HIST_FOOD_NO_IMAGE;
    if (!noImage && !foodFile) {
      throw new Error('Select a food image');
    }
  } catch (error) {
    pushSimLog(formatFailureMessage('Append kcal failed: ', error.message || String(error)));
    return;
  }
  setKcalHistBusy(true);
  const imgLabel = noImage ? 'No image' : foodFile;
  pushSimLog(`Append kcal: starting (${kcal} kcal, ${weight} ${unit}, ${imgLabel})`);
  try {
    const result = await window.mfgApi.appendKcalHist({ kcal, weight, unit,
      foodFiles: [noImage ? '' : foodFile, document.getElementById('simHistPhoto2').value,
        document.getElementById('simHistPhoto3').value].filter(Boolean),
      rating: Number(document.getElementById('simHistRating').value) });
    pushSimLog(result.ok ? result.message : formatFailureMessage('Append kcal failed: ', result.message));
  } catch (error) {
    pushSimLog(formatFailureMessage('Append kcal failed: ', error.message || String(error)));
  } finally {
    setKcalHistBusy(false);
  }
});

refs.simKcalUpdateBtn.addEventListener('click', async () => {
  if (!state.connected) {
    pushSimLog('Countdown update failed: not connected');
    return;
  }
  refs.simKcalUpdateBtn.disabled = true;
  let currentKcal;
  let targetKcal;
  try {
    currentKcal = parseKcalInputValue(refs.simCurrentKcalInput.value, 'Remaining', -9999);
    targetKcal = parseKcalInputValue(refs.simTargetKcalInput.value, 'Target');
  } catch (error) {
    pushSimLog(formatFailureMessage('Countdown update failed: ', error.message || String(error)));
    updateActionButtons();
    return;
  }
  pushSimLog(`Sending countdown update: current ${currentKcal}, target ${targetKcal}…`);
  try {
    const result = await window.mfgApi.scaleUpdateKcal({ currentKcal, targetKcal });
    pushSimLog(result.ok ? result.message : formatFailureMessage('Countdown update failed: ', result.message));
  } catch (error) {
    pushSimLog(formatFailureMessage('Countdown update failed: ', error.message || String(error)));
  } finally {
    updateActionButtons();
  }
});

refs.simNotifyBtn.addEventListener('click', async () => {
  if (!state.connected) {
    pushSimLog('Notify failed: not connected');
    return;
  }
  refs.simNotifyBtn.disabled = true;
  let text;
  let colorRgb565;
  let gray;
  try {
    text = parseNotifyTextInput(refs.simNotifyTextInput.value);
    colorRgb565 = rgb888HexToRgb565(refs.simNotifyColorInput.value);
    if (!window.NotifyRender || typeof window.NotifyRender.renderNotifyTextToGray !== 'function') {
      throw new Error('Notify renderer not loaded');
    }
    pushSimLog(`Notify: rendering text to gray ("${text}")…`);
    gray = window.NotifyRender.renderNotifyTextToGray(text);
    const grayH = gray.length / 24;
    pushSimLog(
      `Notify: data ready (24×${grayH}, ${gray.length} B), starting GATT upload…`
    );
  } catch (error) {
    pushSimLog(formatFailureMessage('Notify failed: ', error.message || String(error)));
    updateActionButtons();
    return;
  }
  try {
    const result = await window.mfgApi.notifyDisplay({
      colorRgb565,
      text,
      gray: Array.from(gray),
    });
    pushSimLog(result.ok ? result.message : formatFailureMessage('Notify failed: ', result.message));
  } catch (error) {
    pushSimLog(formatFailureMessage('Notify failed: ', error.message || String(error)));
  } finally {
    updateActionButtons();
  }
});

refs.factoryBtn?.addEventListener('click', async () => {
  if (!state.connected) {
    pushLog('Factory reset failed: not connected');
    return;
  }
  if (!window.confirm('Factory reset will erase device identity, auth8, and all business data. Continue?')) {
    return;
  }

  refs.simStateText.textContent = 'Factory reset…';
  const result = await window.mfgApi.factoryDevice();
  if (!result.ok) {
    renderConnection();
    pushLog(formatFailureMessage('Factory reset failed: ', result.message));
    return;
  }
  state.connected = false;
  clearDeviceTimeDisplay();
  clearBatteryDisplay();
  clearScaleDisplay();
  clearDeviceStatus();
  renderConnection();
  updateActionButtons();
  pushLog(`${result.message} (reconnect after the device restarts)`);
});

/** Force UI to idle: no selection, disconnected summary, list cards de-highlighted. */
function applySessionIdleUi({ removedDeviceIds, deviceId } = {}) {
  state.connectAttemptSeq += 1;
  state.connecting = false;
  state.connected = false;
  setSimOadBusy(false);
  state.selectedDevice = null;
  setPanelBusy(false);
  if (removedDeviceIds?.length) {
    removeDevices(removedDeviceIds);
  } else if (deviceId) {
    removeDevices([deviceId]);
  }
  renderSelectedDeviceSummary(null);
  clearDeviceTimeDisplay();
  clearScaleDisplay();
  clearDeviceStatus();
  renderConnection();
  updateActionButtons();
}

function syncSelectionAfterDeviceListChange() {
  if (!state.selectedDevice) {
      updateActionButtons();
    return;
  }
  const updatedSelected = state.devices.find((device) => device.id === state.selectedDevice.id);
  if (updatedSelected) {
    state.selectedDevice = updatedSelected;
    renderSelectedDeviceSummary(updatedSelected);
    if ((state.connected || state.connecting) && updatedSelected.scaleReading) {
      applyScaleReading(updatedSelected.scaleReading);
    }
    if ((state.connected || state.connecting) && updatedSelected.deviceStatus) {
      applyDeviceStatus(updatedSelected.deviceStatus);
    }
    updateActionButtons();
      return;
  }
  clearSelectedDevice();
}

refs.simBindBtn.addEventListener('click', async () => {
  if (!state.connected) {
    pushSimLog('Bind failed: not connected');
    return;
  }
  setMorphThemeBusy(true);
  pushSimLog('Binding, installing preset1 emotion, then rebooting…');
  try {
    const result = await window.mfgApi.bindDevice();
    if (!result || !result.ok) {
      pushSimLog(formatFailureMessage('Bind failed: ', result && result.message ? result.message : 'unknown error'));
      return;
    }
    applySessionIdleUi({ deviceId: result.deviceId });
    pushSimLog(result.message);
  } catch (error) {
    pushSimLog(formatFailureMessage('Bind failed: ', error.message || String(error)));
  } finally {
    setMorphThemeBusy(false);
    updateActionButtons();
  }
});

refs.simResetBtn?.addEventListener('click', async () => {
  if (!state.connected) {
    pushSimLog('Reset failed: not connected');
    return;
  }
  if (!window.confirm('Reset will erase binding/auth8, countdown, coffee recipe, Kcal history, morph theme, and pending notify data. The device P-256 identity will be kept. Continue?')) {
    return;
  }
  refs.simResetBtn.disabled = true;
  pushSimLog('Sending reset…');
  try {
    const result = await window.mfgApi.resetDevice();
    if (!result || !result.ok) {
      pushSimLog(formatFailureMessage('Reset failed: ', result && result.message ? result.message : 'unknown error'));
      return;
    }
    state.connected = false;
    clearDeviceTimeDisplay();
    clearBatteryDisplay();
    clearScaleDisplay();
    clearDeviceStatus();
    renderConnection();
    updateActionButtons();
    pushSimLog(`${result.message} (reconnect after the device restarts)`);
  } catch (error) {
    pushSimLog(formatFailureMessage('Reset failed: ', error.message || String(error)));
  } finally {
    refs.simResetBtn.disabled = false;
    updateActionButtons();
  }
});

refs.simFirmwareBtn.addEventListener('click', async () => {
  const result = await window.mfgApi.selectSimFirmware();
  if (!result.ok || result.canceled) return;
  state.simFirmwarePath = result.path || '';
  updateSimFirmwarePreview();
  updateActionButtons();
});

refs.simOadBtn.addEventListener('click', async () => {
  if (!state.connected) {
    pushSimLog('OAD failed: not connected');
    return;
  }
  if (!state.simFirmwarePath) {
    pushSimLog('OAD failed: select a firmware file');
    return;
  }
  setSimOadBusy(true);
  resetSimOadProgress();
  pushSimLog(`Starting OAD: ${simFirmwareDisplayName()}`);
  try {
    const result = await window.mfgApi.startSimOad({ firmwarePath: state.simFirmwarePath });
    if (!result.ok) {
      pushSimLog(formatFailureMessage('OAD failed: ', result.message));
      if (typeof result.elapsedMs === 'number') {
        pushSimLog(formatOadElapsedLog(result.elapsedMs, 'failed'));
      }
      await playSimOadOutcomeAnimation('failure');
      return;
    }
    setSimOadProgress(100);
    pushSimLog(result.message || 'OAD complete');
    if (typeof result.elapsedMs === 'number') {
      pushSimLog(formatOadElapsedLog(result.elapsedMs, 'success'));
    }
    await playSimOadOutcomeAnimation('success');
  } catch (error) {
    pushSimLog(formatFailureMessage('OAD failed: ', error.message || String(error)));
    await playSimOadOutcomeAnimation('failure');
  } finally {
    setSimOadBusy(false);
    updateActionButtons();
    }
});


refs.simTabBtn?.addEventListener('click', () => showView('connect'));

if (refs.homeBrandBtn) {
  refs.homeBrandBtn.addEventListener('click', () => showView('connect'));
}

document.querySelectorAll('[data-nav]').forEach((el) => {
  el.addEventListener('click', () => {
    const view = el.getAttribute('data-nav');
    if (view) showView(view);
  });
});

document.querySelectorAll('.nav-item[data-view]').forEach((el) => {
  el.addEventListener('click', () => {
    const view = el.getAttribute('data-view');
    if (view) showView(view);
  });
});

if (refs.logDrawerToggle) {
  refs.logDrawerToggle.addEventListener('click', () => setLogDrawerOpen(!state.logDrawerOpen));
}
if (refs.logDrawerClose) {
  refs.logDrawerClose.addEventListener('click', () => setLogDrawerOpen(false));
}

refs.simClearLogBtn.addEventListener('click', () => {
  resetSimLog();
});

window.mfgApi.onSimOadProgress(({ progress }) => {
  if (state.simOadOutcomeAnimating) return;
  setSimOadProgress(progress);
});

window.mfgApi.onSimActionLog(({ line, progressKey }) => {
  const text = String(line || '').trim();
  if (!text) return;
  if (progressKey) {
    pushSimLog(text, { progressKey: String(progressKey) });
    return;
  }
  pushSimLog(text);
});


window.mfgApi.onBatteryUpdate(({ deviceId, batteryLevel }) => {
  if (!state.selectedDevice || state.selectedDevice.id !== deviceId) return;
  const level = Number(batteryLevel);
  if (!Number.isFinite(level)) return;
  state.devices = state.devices.map((device) =>
    device.id === deviceId ? { ...device, batteryLevel: level } : device
  );
  state.selectedDevice = {
    ...state.selectedDevice,
    batteryLevel: level,
  };
  renderSelectedDeviceSummary(state.selectedDevice);
});

updateSimFirmwarePreview();
resetSimOadProgress();

boot().catch((error) => {
  pushLog(formatFailureMessage('UI boot failed: ', error.message));
});

async function sendContainerWeight(clear) {
  if (!state.connected || state.containerBusy) return;
  state.containerBusy = true;
  updateActionButtons();
  try {
    const result = await window.mfgApi.setContainerWeight({ grams: clear ? null : refs.simContainerWeight.value });
    if (!result || !result.ok) throw new Error(result?.message || 'Container weight command failed');
    refs.simContainerStatus.textContent = result.message;
    pushSimLog(result.message);
  } catch (error) {
    refs.simContainerStatus.textContent = error.message || String(error);
    pushSimLog(formatFailureMessage('Container weight failed: ', refs.simContainerStatus.textContent));
  } finally {
    state.containerBusy = false;
    updateActionButtons();
  }
}
refs.simContainerSet.addEventListener('click', () => void sendContainerWeight(false));
refs.simContainerClear.addEventListener('click', () => void sendContainerWeight(true));

window.mfgApi.onActionBusy(({busy}) => {
  state.actionBusy = busy;
  document.querySelectorAll('#viewTest button, #viewTest input, #viewTest select, #simBindBtn, #simResetBtn, #factoryBtn, #simOadBtn, #simRefreshScanBtn').forEach(el => { el.disabled = busy; });
  if (!busy) { updateActionButtons(); renderCoffeeControls(); }
});
// Swipe on page surfaces; preserve input sliders, selection and simulator gestures.
const screenViewport = document.getElementById('screenViewport');
let screenGesture = null;
screenViewport.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || event.target.closest('button,input,select,textarea,a,summary,iframe,label,[role=listbox],.compact-row')) return;
  screenGesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
screenViewport.addEventListener('pointerup', event => {
  const gesture = screenGesture; screenGesture = null;
  if (!gesture || gesture.id !== event.pointerId) return;
  const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  const index = Math.max(0, Math.min(VIEWS.length - 1, VIEWS.indexOf(state.activeView) + (dx < 0 ? 1 : -1)));
  showView(VIEWS[index]);
});
screenViewport.addEventListener('pointercancel', () => { screenGesture = null; });
screenViewport.addEventListener('keydown', event => {
  if (event.target !== screenViewport) return;
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 :
    Math.max(0, Math.min(VIEWS.length - 1, VIEWS.indexOf(state.activeView) + (event.key === 'ArrowRight' ? 1 : -1)));
  showView(VIEWS[index]);

});

// Trackpad horizontal gestures switch one screen per gesture without blocking vertical scroll.
let wheelDistance = 0, wheelSwitched = false, wheelReset;
screenViewport.addEventListener('wheel', event => {
  if (event.target.closest('.compact-row') || Math.abs(event.deltaX) <= Math.abs(event.deltaY) || event.ctrlKey) return;
  event.preventDefault();
  clearTimeout(wheelReset);
  wheelReset = setTimeout(() => { wheelDistance = 0; wheelSwitched = false; }, 180);
  if (wheelSwitched) return;
  wheelDistance += event.deltaX * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? screenViewport.clientWidth : 1);
  if (Math.abs(wheelDistance) < 60) return;
  wheelSwitched = true;
  const index = Math.max(0, Math.min(VIEWS.length - 1, VIEWS.indexOf(state.activeView) + (wheelDistance > 0 ? 1 : -1)));
  showView(VIEWS[index]);
}, { passive: false });

// Allow horizontal dragging inside compact rows without changing app screens.
document.querySelectorAll('.compact-row').forEach(row => {
  let drag;
  row.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('input,select,button,[role=listbox]')) return;
    drag = {id:event.pointerId,x:event.clientX,y:event.clientY,left:row.scrollLeft};
  });
  row.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(Math.abs(dx)>8 && Math.abs(dx)>Math.abs(dy)) {
      row.setPointerCapture(event.pointerId);row.scrollLeft=drag.left-dx;
    }
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture']) row.addEventListener(name,()=>{drag=null;});
});

const deviceUnitInput = document.getElementById('deviceUnitValue');
deviceUnitInput.addEventListener('change', async () => {
  if (deviceUnitInput.disabled) return;
  try {
    const result = await window.mfgApi.scaleSetUnit({unit:Number(deviceUnitInput.value)});
    if (!result?.ok) throw new Error(result?.message || 'Unit change failed');
    pushSimLog(result.message);
  } catch (error) {
    pushSimLog(formatFailureMessage('Unit change failed: ', error.message));
    deviceUnitInput.value = String(state.scaleReading?.unit === 1 ? 1 : 0);
    deviceUnitInput.dispatchEvent(new Event('unit-render'));
  }
});
