"""Development-only loopback BLE bridge for the WeChat simulator (macOS)."""
import asyncio
from collections import deque
import contextlib
import json
from pathlib import Path
import re
import secrets
import signal
import time

from bleak import BleakClient, BleakScanner

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / 'miniprogram/lib/desktop-ble-config.js'
PORT = 8768

class Bridge:
    def __init__(self):
        self.token = secrets.token_urlsafe(32)
        self.owner = None
        self.scanner = None
        self.devices = {}
        self.records = {}
        self.client = None
        self.device_id = None
        self.events = deque(maxlen=4096)
        self.sequence = 0
        self.changed = asyncio.Event()
        self.lock = asyncio.Lock()
        self.last_seen = time.monotonic()

    def emit(self, event, data):
        self.sequence += 1
        self.events.append(dict(seq=self.sequence, event=event, data=data))
        self.changed.set()

    def found(self, device, ad):
        name = ad.local_name or device.name or ''
        if not re.fullmatch(r'YD-[0-9a-fA-F]{12}', name):
            return
        self.devices[device.address] = device
        manufacturer = b''.join(k.to_bytes(2, 'little') + v for k, v in ad.manufacturer_data.items())
        record = dict(deviceId=device.address, name=name, localName=name, RSSI=ad.rssi,
                      advertisServiceUUIDs=ad.service_uuids, advertisData=list(manufacturer))
        self.records[device.address] = record
        self.emit('BluetoothDeviceFound', {'devices': [record]})

    async def stop_scan(self):
        if self.scanner:
            scanner, self.scanner = self.scanner, None
            await scanner.stop()

    async def disconnect(self):
        client, self.client = self.client, None
        if client:
            await client.disconnect()

    async def cleanup(self):
        await self.stop_scan()
        await self.disconnect()

    def disconnected(self, client):
        if self.client is client:
            self.client = None
        self.emit('BLEConnectionStateChange', dict(deviceId=client.address, connected=False))

    def characteristic(self, options):
        if not self.client or not self.client.is_connected:
            raise ValueError('Device disconnected')
        service = self.client.services.get_service(options['serviceId'])
        if not service:
            raise ValueError('Service not found')
        char = service.get_characteristic(options['characteristicId'])
        if not char:
            raise ValueError('Characteristic not found')
        return char

    async def command(self, method, options):
        if method == 'openBluetoothAdapter':
            return {}
        if method == 'getBluetoothAdapterState':
            return dict(available=True, discovering=self.scanner is not None)
        if method == 'startBluetoothDevicesDiscovery':
            await self.stop_scan()
            self.records.clear()
            self.devices.clear()
            self.scanner = BleakScanner(self.found)
            try:
                await self.scanner.start()
            except BaseException:
                self.scanner = None
                raise
            return {}
        if method == 'stopBluetoothDevicesDiscovery':
            await self.stop_scan()
            return {}
        if method == 'getBluetoothDevices':
            return {'devices': list(self.records.values())}
        if method == 'createBLEConnection':
            device = self.devices.get(options['deviceId'])
            if not device:
                raise ValueError('Scan again before connecting this device')
            await self.stop_scan()
            await self.disconnect()
            client = BleakClient(device, disconnected_callback=self.disconnected, timeout=12)
            self.client = client
            self.device_id = device.address
            try:
                await client.connect()
            except BaseException:
                await self.disconnect()
                raise
            self.emit('BLEConnectionStateChange', dict(deviceId=device.address, connected=True))
            print(f'Connected {device.name}', flush=True)
            return {}
        if method in ('closeBLEConnection', 'closeBluetoothAdapter'):
            if method == 'closeBluetoothAdapter':
                await self.stop_scan()
            await self.disconnect()
            return {}
        if not self.client or not self.client.is_connected or options.get('deviceId') != self.device_id:
            raise ValueError('Device disconnected')
        if method == 'getBLEMTU':
            return {'mtu': self.client.mtu_size}
        if method == 'getBLEDeviceServices':
            return {'services': [dict(uuid=s.uuid, isPrimary=True) for s in self.client.services]}
        if method == 'getBLEDeviceCharacteristics':
            service = self.client.services.get_service(options['serviceId'])
            if not service:
                raise ValueError('Service not found')
            return {'characteristics': [dict(uuid=c.uuid, properties={
                'read': 'read' in c.properties, 'write': 'write' in c.properties,
                'writeNoResponse': 'write-without-response' in c.properties,
                'notify': 'notify' in c.properties, 'indicate': 'indicate' in c.properties,
            }) for c in service.characteristics]}
        char = self.characteristic(options)
        target = dict(deviceId=self.device_id, serviceId=char.service_uuid, characteristicId=char.uuid)
        if method == 'readBLECharacteristicValue':
            data = await self.client.read_gatt_char(char)
            self.emit('BLECharacteristicValueChange', dict(**target, value=list(data)))
        elif method == 'writeBLECharacteristicValue':
            data = bytes(options['value'])
            response = options.get('writeType') != 'writeNoResponse'
            limit = 512 if response else char.max_write_without_response_size
            if len(data) > limit:
                raise ValueError('Write exceeds the native BLE payload limit')
            await self.client.write_gatt_char(char, data, response=response)
        elif method == 'notifyBLECharacteristicValueChange':
            if options['state']:
                await self.client.start_notify(char, lambda c, v: self.emit(
                    'BLECharacteristicValueChange', dict(**target, value=list(v))))
            else:
                await self.client.stop_notify(char)
        else:
            raise ValueError('Unsupported BLE method')
        return {}

    async def dispatch(self, body):
        client_id = body.get('client')
        if not isinstance(client_id, str) or not 8 <= len(client_id) <= 100:
            raise ValueError('Invalid client')
        if body.get('method') == 'hello':
            async with self.lock:
                if self.owner != client_id:
                    await self.cleanup()
                    self.owner = client_id
                    self.events.clear()
                self.last_seen = time.monotonic()
                return {'cursor': self.sequence}
        if client_id != self.owner:
            raise ValueError('Bridge session replaced. Recompile the Mini Program.')
        self.last_seen = time.monotonic()
        if body.get('method') == 'events':
            cursor = int(body.get('cursor', 0))
            if self.events and cursor < self.events[0]['seq'] - 1:
                raise ValueError('Bluetooth events overflowed. Reconnect the device.')
            self.changed.clear()
            if self.sequence <= cursor:
                with contextlib.suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(self.changed.wait(), 1)
            return {'events': [e for e in self.events if e['seq'] > cursor]}
        async with self.lock:
            if client_id != self.owner:
                raise ValueError('Bridge session replaced')
            return await asyncio.wait_for(self.command(body.get('method'), body.get('options', {})), 14)

    async def handle(self, reader, writer):
        status = '200 OK'
        try:
            header = await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'), 5)
            lines = header.decode('ascii').split('\r\n')
            headers = {k.lower(): v.strip() for k, v in (line.split(':', 1) for line in lines[1:] if ':' in line)}
            if lines[0] != 'POST /rpc HTTP/1.1' or headers.get('host', '').strip() != f'127.0.0.1:{PORT}':
                raise ValueError('Invalid endpoint')
            # No CORS: web pages cannot read this bridge or send authenticated requests.
            if not secrets.compare_digest(headers.get('authorization', '').strip(), 'Bearer ' + self.token):
                status = '403 Forbidden'
                raise ValueError('Unauthorized')
            length = int(headers.get('content-length', '0'))
            if not 0 < length <= 65536:
                raise ValueError('Invalid request size')
            body = json.loads(await asyncio.wait_for(reader.readexactly(length), 5))
            result = {'ok': True, 'result': await self.dispatch(body)}
        except Exception as error:
            result = {'ok': False, 'error': str(error) or type(error).__name__}
        data = json.dumps(result).encode()
        writer.write(f'HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {len(data)}\r\nConnection: close\r\n\r\n'.encode() + data)
        with contextlib.suppress(Exception):
            await writer.drain()
        writer.close()
        with contextlib.suppress(Exception):
            await writer.wait_closed()

    async def watchdog(self):
        while True:
            await asyncio.sleep(5)
            if self.owner and time.monotonic() - self.last_seen > 15:
                async with self.lock:
                    await self.cleanup()
                    self.owner = None

async def main():
    bridge = Bridge()
    server = await asyncio.start_server(bridge.handle, '127.0.0.1', PORT)
    config = 'module.exports=' + json.dumps(dict(url=f'http://127.0.0.1:{PORT}/rpc', token=bridge.token)) + ';\n'
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    CONFIG.write_text(config)
    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        asyncio.get_running_loop().add_signal_handler(sig, stop.set)
    watchdog = asyncio.create_task(bridge.watchdog())
    print(f'KCALACK desktop BLE ready on 127.0.0.1:{PORT}. Recompile WeChat Devtools. Ctrl+C stops it.', flush=True)
    try:
        async with server:
            await stop.wait()
    finally:
        watchdog.cancel()
        await bridge.cleanup()
        if CONFIG.exists() and CONFIG.read_text() == config:
            CONFIG.write_text('module.exports=null;\n')

if __name__ == '__main__':
    asyncio.run(main())
