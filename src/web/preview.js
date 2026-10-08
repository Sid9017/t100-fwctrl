/** The embedded renderer is local-only. BLE notifications flow one way into it. */
export function attachPreview(service) {
  const frame = document.getElementById('runtimeFrame');
  const source = document.getElementById('previewSource');
  let reading = null;
  let runtime = null;
  let appliedStatus = null;
  let pairing = false;
  const sync = () => {
    if (!runtime?.ready) return;
    const bindState = service.entry?.ui.bindState;
    if (bindState === 'unbind') {
      if (!pairing) runtime.dispatch('pairing');
      pairing = true; appliedStatus = null;
      source.textContent = 'Unbound · pairing code preview (sample identity)';
      return;
    }
    if (bindState !== 'bound') return;
    const status = service.entry?.ui.deviceStatus;
    if (!status || !Number.isInteger(status.screen)) {
      source.textContent = 'Waiting for device status';
      return;
    }
    pairing = false;
    const signature = JSON.stringify(status);
    if (signature !== appliedStatus) {
      runtime.dispatch('status', status);
      appliedStatus = signature;
    }
    if (reading && Number.isFinite(Number(reading.value)) && [0,1].includes(reading.unit)) {
      runtime.dispatch('unit', {unit:reading.unit === 1 ? 'oz' : 'g'});
      runtime.dispatch('weight', {grams:reading.unit === 1 ? reading.value / 100 * 28.349523125 : reading.value / 1000});
    }
    source.textContent = `Bluetooth status · ${status.screenName || 'Unknown'} · ${status.phaseName || ''}`;

  };
  service.on('ScanUpsert', sync);
  service.on('StatusUpdate', sync);
  service.on('ScaleUpdate', payload => { reading = payload.reading; sync(); });
  const detached = () => {
    reading = null; appliedStatus = null; pairing = false;
    runtime?.dispatch('detachStatus');
    source.textContent = 'No device connected';
  };
  service.on('SessionIdle', detached);
  service.on('ConnectionLost', detached);
  let observer;
  let timer;
  function loaded() {
    observer?.disconnect(); clearInterval(timer);
    const doc = frame.contentDocument;
    if (!doc?.body) return;
    const resize = () => { frame.style.height = `${Math.ceil(doc.body.getBoundingClientRect().height) + 2}px`; };
    observer = new ResizeObserver(resize); observer.observe(doc.body); resize();
    timer = setInterval(() => {
      runtime = frame.contentWindow.t100Preview;
      if (runtime?.ready) { clearInterval(timer); sync(); }
      else if (doc.getElementById('runtimeText')?.textContent.startsWith('Wasm failed')) {
        clearInterval(timer); source.textContent = 'Simulator unavailable · Bluetooth controls remain available';
      }
    }, 100);
  }
  frame.addEventListener('load', loaded);
  if (frame.contentDocument?.readyState === 'complete') loaded();
  window.addEventListener('pagehide', () => { clearInterval(timer); observer?.disconnect(); });
}
