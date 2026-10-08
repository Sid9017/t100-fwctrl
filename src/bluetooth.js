export function capability(env = globalThis) {
  if (!env.isSecureContext) return { ok: false, title: 'Secure connection required', detail: 'Open this site over HTTPS. Use localhost for local development. Bluetooth is unavailable when a phone accesses a computer over a local network HTTP address.' };
  if (typeof env.navigator?.bluetooth?.requestDevice !== 'function') return {
    ok: false, title: 'This browser does not support Bluetooth scanning',
    detail: 'Use desktop Chrome / Edge or Chrome on Android. Standard iPhone / iPad browsers do not currently support this feature, but you can still view the page.',
  };
  return { ok: true, title: 'This browser supports Bluetooth scanning', detail: 'Turn on Bluetooth, wake up a nearby T100, and select it in the browser dialog.' };
}

export function scanError(error) {
  switch (error?.name) {
    case 'NotFoundError': return { kind: 'info', message: 'No device selected. If the list is empty, wake up your T100, check that Bluetooth is on and system permissions are granted, then try again.' };
    case 'NotAllowedError':
    case 'SecurityError': return { kind: 'error', message: 'Bluetooth access denied. Check browser and system Bluetooth permissions, then try again with this page opened directly over HTTPS.' };
    case 'NotSupportedError':
    case 'TypeError': return { kind: 'error', message: 'This browser cannot scan for T100 devices. Update Chrome / Edge and try again.' };
    case 'NetworkError': return { kind: 'error', message: 'Bluetooth is currently unavailable. Make sure Bluetooth is on and try again.' };
    default: return { kind: 'error', message: 'Scanning did not complete. Check Bluetooth and browser permissions, then try again.' };
  }
}
