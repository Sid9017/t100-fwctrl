'use strict';

/** Decode DIS 0x2A26 UTF-8 and strip trailing NUL bytes. */
function decodeDisUtf8(buf) {
  if (!buf || !buf.length) return '';
  let end = buf.length;
  while (end > 0 && buf[end - 1] === 0) end--;
  return buf.slice(0, end).toString('utf8');
}

exports.decodeDisUtf8 = decodeDisUtf8;
