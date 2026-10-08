'use strict';

const FEE0_STATUS_WIRE_LEN = 8;

const STATUS_SCREENS = Object.freeze({
  0x00: 'UNKNOWN',
  0x01: 'IDLE',
  0x02: 'IDLE_SLEEP',
  0x03: 'COUNTDOWN',
  0x04: 'SCALE',
  0x05: 'KCAL_HISTORY',
  0x06: 'NOTIFY',
  0x07: 'COFFEE_SCALE',
});

const STATUS_MODES = Object.freeze({
  0x00: 'UNKNOWN',
  0x01: 'PENDING_BOOT',
  0x02: 'RUNNING',
  0x03: 'OAD_UPDATING',
  0x04: 'RESETTING',
  0x05: 'LIGHT_SLEEPING',
  0x06: 'DEEP_SLEEPING',
});

const STATUS_FLAG_BITS = Object.freeze([
  Object.freeze({ bit: 0, name: 'BOUND' }),
  Object.freeze({ bit: 1, name: 'CHARGING' }),
  Object.freeze({ bit: 2, name: 'LOW_BATTERY' }),
  Object.freeze({ bit: 3, name: 'HALL_ATTACHED' }),
  Object.freeze({ bit: 4, name: 'DISPLAY_READY' }),
  Object.freeze({ bit: 5, name: 'COUNTDOWN_CONFIGURED' }),
  Object.freeze({ bit: 6, name: 'HISTORY_AVAILABLE' }),
  Object.freeze({ bit: 7, name: 'NOTIFY_RX_BUSY' }),
  Object.freeze({ bit: 8, name: 'COFFEE_CONFIGURED' }),
  Object.freeze({ bit: 9, name: 'COFFEE_ACTIVE' }),
  Object.freeze({ bit: 10, name: 'COFFEE_POUR_OVER' }),
  Object.freeze({ bit: 11, name: 'COFFEE_TIMER_RUNNING' }),
  Object.freeze({ bit: 12, name: 'COFFEE_WATER_STAGE' }),
  Object.freeze({ bit: 13, name: 'COFFEE_CONFIG_DIRTY' }),
  Object.freeze({ bit: 14, name: 'COFFEE_TARGET_REACHED' }),
  Object.freeze({ bit: 15, name: 'COFFEE_TARGET_OVERRUN' }),
  Object.freeze({ bit: 16, name: 'COFFEE_ANIMATING' }),
]);

function enumName(table, value) {
  return table[value] || `UNKNOWN_0x${value.toString(16).padStart(2, '0').toUpperCase()}`;
}

function phaseName(screen, phase) {
  const names = {
    IDLE: ['READY'],
    IDLE_SLEEP: ['SLEEPING'],
    COUNTDOWN: ['UNCONFIGURED', 'ACTIVE', 'COMPLETE'],
    SCALE: ['MOVING', 'SETTLING', 'STABLE'],
    COFFEE_SCALE: ['READY', 'RUNNING', 'PAUSED'],
    KCAL_HISTORY: ['SETTLED', 'SLIDING'],
    NOTIFY: ['ENTERING', 'DISPLAYING', 'EXITING'],
  };
  const list = names[screen];
  return (list && list[phase]) || `PHASE_${phase}`;
}

function decodeFee0StatusWire(value) {
  const data = Buffer.from(value || []);
  if (data.length < FEE0_STATUS_WIRE_LEN) return null;
  const length = data.readUInt8(0);
  if (length < FEE0_STATUS_WIRE_LEN || data.length < length) return null;

  const screen = data.readUInt8(1);
  const phase = data.readUInt8(2);
  const mode = data.readUInt8(3);
  const flags = data.readUInt32LE(4);
  const screenName = enumName(STATUS_SCREENS, screen);
  const decoded = {
    length,
    screen,
    screenName,
    phase,
    phaseName: phaseName(screenName, phase),
    mode,
    modeName: enumName(STATUS_MODES, mode),
    flags,
    flagNames: STATUS_FLAG_BITS
      .filter(({ bit }) => (flags & (1 << bit)) !== 0)
      .map(({ name }) => name),
  };
  if (length >= 20) {
    const profile = data.readUInt8(9);
    decoded.coffee = {
      schema: data.readUInt8(8),
      mode: profile,
      profile,
      stage: data.readUInt8(10),
      uiPhase: data.readUInt8(11),
      primaryTargetMg: data.readUInt32LE(12),
      waterTargetMg: data.readUInt32LE(16),
    };
  }
  return decoded;
}

module.exports = {
  FEE0_STATUS_WIRE_LEN,
  STATUS_SCREENS,
  STATUS_MODES,
  STATUS_FLAG_BITS,
  decodeFee0StatusWire,
};
