import { capability, Scanner } from './bluetooth.js';
const $ = (id) => document.getElementById(id);
const support = capability();
const scanner = new Scanner(navigator.bluetooth);
const formatTime = (date) => date.toLocaleTimeString('en-US', { hour12: false });

function log(message, kind = 'info') {
  const row = document.createElement('li');
  const time = document.createElement('time');
  const now = new Date();
  time.dateTime = now.toISOString();
  time.textContent = formatTime(now);
  const text = document.createElement('span');
  text.textContent = message;
  row.className = kind;
  row.append(time, text);
  $('logs').append(row);
  while ($('logs').children.length > 100) $('logs').firstElementChild.remove();
  $('logs').scrollTop = $('logs').scrollHeight;
}

function renderDevices() {
  $('devices').replaceChildren();
  for (const device of [...scanner.devices.values()].reverse()) {
    const row = document.createElement('li');
    row.className = 'device-card';
    const top = document.createElement('div');
    top.className = 'device-top';
    const name = document.createElement('strong');
    name.className = 'device-name';
    name.textContent = device.name;
    const tag = document.createElement('span');
    tag.className = 'device-tag';
    tag.textContent = 'Selected · Not connected';
    top.append(name, tag);
    const id = document.createElement('p');
    id.className = 'device-id';
    id.textContent = `Browser device ID / ${device.id}`;
    const meta = document.createElement('p');
    meta.className = 'device-meta';
    meta.textContent = `T100 · Selected at ${formatTime(device.selectedAt)}`;
    row.append(top, id, meta);
    $('devices').append(row);
  }
  $('empty').hidden = scanner.devices.size > 0;
  $('count').textContent = String(scanner.devices.size).padStart(2, '0');
  $('clear-devices').disabled = scanner.busy || scanner.devices.size === 0;
}

$('compat-title').textContent = support.title;
$('compat-detail').textContent = support.detail;
$('compatibility').classList.toggle('unsupported', !support.ok);
$('hud-state').textContent = support.ok ? 'Ready to scan' : 'Unsupported browser environment';
$('scan-status').textContent = support.ok ? 'Scanning takes place in the browser device picker.' : 'Use a supported browser and open this page over HTTPS.';
$('scan').disabled = !support.ok;
log(support.ok ? 'Bluetooth scanning is ready. Select a device to continue.' : support.title, support.ok ? 'info' : 'error');

$('scan').addEventListener('click', async () => {
  if (!support.ok || scanner.busy) return;
  // Start immediately: awaiting availability first could lose user activation.
  const selection = scanner.select();
  $('scan').disabled = true;
  $('clear-devices').disabled = true;
  $('scan-label').textContent = 'Select a device in the dialog';
  $('scan-visual').classList.add('scanning');
  $('hud-state').textContent = 'Waiting for selection';
  $('scan-status').className = 'scan-status';
  $('scan-status').textContent = 'Waiting for a selection in the browser device picker. Cancel to stop scanning.';
  log('Opening the T100 device picker.');
  const result = await selection;
  const message = result.kind === 'selected'
    ? `${result.repeated ? 'Updated' : 'Selected'} ${result.record.name}. No connection has been established.`
    : result.message;
  $('scan-status').textContent = message;
  $('scan-status').classList.toggle('error', result.kind === 'error');
  log(message, result.kind === 'selected' ? 'success' : result.kind);
  $('scan').disabled = false;
  $('scan-label').textContent = 'Scan for T100 Devices';
  $('scan-visual').classList.remove('scanning');
  $('hud-state').textContent = scanner.devices.size ? 'Selected · Not connected' : 'Ready to scan';
  renderDevices();
});

$('clear-devices').addEventListener('click', () => {
  scanner.clear();
  renderDevices();
  $('hud-state').textContent = 'Ready to scan';
  $('scan-status').textContent = 'Scanning takes place in the browser device picker.';
  $('scan-status').className = 'scan-status';
  log('Device list cleared. Browser device permissions have not been revoked.');
});
$('clear-log').addEventListener('click', () => $('logs').replaceChildren());
