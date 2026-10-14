// Maps friendly string names to Rive's Fit / Alignment enum values.
// The enums live on the loaded module (rive.Fit / rive.Alignment), so resolution
// happens at runtime against a module reference.

const FIT_NAMES = ['fill', 'contain', 'cover', 'fitWidth', 'fitHeight', 'none', 'scaleDown', 'layout'];
const ALIGN_NAMES = [
  'topLeft', 'topCenter', 'topRight',
  'centerLeft', 'center', 'centerRight',
  'bottomLeft', 'bottomCenter', 'bottomRight',
];

const DEFAULT_FIT = 'contain';
const DEFAULT_ALIGNMENT = 'center';

function resolveFit(rive, name) {
  const key = FIT_NAMES.indexOf(name) >= 0 ? name : DEFAULT_FIT;
  return rive.Fit[key];
}

function resolveAlignment(rive, name) {
  const key = ALIGN_NAMES.indexOf(name) >= 0 ? name : DEFAULT_ALIGNMENT;
  return rive.Alignment[key];
}

module.exports = { resolveFit, resolveAlignment, FIT_NAMES, ALIGN_NAMES, DEFAULT_FIT, DEFAULT_ALIGNMENT };
