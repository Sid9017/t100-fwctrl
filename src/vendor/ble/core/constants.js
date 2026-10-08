'use strict';

const { UUIDS } = require('../protocol');

/** @enum {string} */
exports.UUID_FEE0 = UUIDS.services.vendor;
exports.UUID_FEE2 = UUIDS.characteristics.vendorDownlinkCommand;
exports.UUID_FEE3 = UUIDS.characteristics.vendorDownlinkRequest;
exports.UUID_FEE1 = UUIDS.characteristics.vendorUplinkNotify;
/** @deprecated 日志 notify 已由 0xFEE4 迁至 0xFEE1；此导出等同 {@link UUID_FEE1}。 */
exports.UUID_FEE4 = exports.UUID_FEE1;
exports.UUID_DIS_SVC = UUIDS.services.deviceInfo;
exports.UUID_FW_REV = UUIDS.characteristics.firmwareRevision;

/** Suggested post-write delay for GATT Write Command. */
exports.WRITE_CMD_FLUSH_MS = 400;
