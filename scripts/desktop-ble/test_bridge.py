import asyncio
import json
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
from bridge import Bridge

class BridgeTests(unittest.IsolatedAsyncioTestCase):
    async def test_http_authentication_and_endpoint(self):
        bridge = Bridge()
        server = await asyncio.start_server(bridge.handle, '127.0.0.1', 0)
        port = server.sockets[0].getsockname()[1]
        async def request(token, method='hello'):
            reader, writer = await asyncio.open_connection('127.0.0.1', port)
            body = json.dumps({'client': 'test-client', 'method': method}).encode()
            writer.write(f'POST /rpc HTTP/1.1\r\nHost: 127.0.0.1:8768\r\nAuthorization: Bearer {token}\r\nContent-Length: {len(body)}\r\n\r\n'.encode()+body)
            await writer.drain()
            raw = await reader.read()
            writer.close()
            await writer.wait_closed()
            return json.loads(raw.split(b'\r\n\r\n', 1)[1])
        try:
            self.assertFalse((await request('wrong'))['ok'])
            self.assertIsNone(bridge.owner)
            self.assertTrue((await request(bridge.token))['ok'])
            self.assertEqual(bridge.owner, 'test-client')
            self.assertFalse((await request(bridge.token, 'arbitrary-command'))['ok'])
        finally:
            server.close()
            await server.wait_closed()

    async def test_advertisements_binary_io_and_new_session_cleanup(self):
        bridge = Bridge()
        device = SimpleNamespace(address='native-uuid', name='YD-03148c52fb00')
        ad = SimpleNamespace(local_name=device.name, rssi=-46, manufacturer_data={0x6000:bytes([0x50,2,1,1])}, service_uuids=[])
        bridge.found(device, ad)
        self.assertEqual(bridge.records[device.address]['advertisData'], [0,96,80,2,1,1])
        char = SimpleNamespace(uuid='fee5', service_uuid='fee0', max_write_without_response_size=182)
        service = SimpleNamespace(get_characteristic=lambda uuid:char)
        client = SimpleNamespace(is_connected=True, services=SimpleNamespace(get_service=lambda uuid:service),
            read_gatt_char=AsyncMock(return_value=bytes([0,128,255])), write_gatt_char=AsyncMock(), disconnect=AsyncMock())
        bridge.client=client; bridge.device_id=device.address
        target={'deviceId':device.address, 'serviceId':'fee0', 'characteristicId':'fee5'}
        await bridge.command('readBLECharacteristicValue', target)
        self.assertEqual(bridge.events[-1]['data']['value'], [0,128,255])
        await bridge.command('writeBLECharacteristicValue',dict(target,value=[0,128,255],writeType='writeNoResponse'))
        client.write_gatt_char.assert_awaited_once_with(char,bytes([0,128,255]),response=False)
        with self.assertRaises(ValueError):
            await bridge.command('writeBLECharacteristicValue',dict(target,value=[0]*183,writeType='writeNoResponse'))
        await bridge.dispatch({'client':'new-client','method':'hello'})
        client.disconnect.assert_awaited_once()
        self.assertIsNone(bridge.client)
        with self.assertRaises(ValueError):
            await bridge.dispatch({'client':'old-client','method':'getBluetoothDevices'})

    async def test_events_overflow_is_reported_instead_of_silent_packet_loss(self):
        bridge=Bridge();bridge.owner='test-client'
        for i in range(4100):bridge.emit('BLECharacteristicValueChange',{'value':[i%256]})
        with self.assertRaisesRegex(ValueError,'overflowed'):
            await bridge.dispatch({'client':'test-client','method':'events','cursor':0})

if __name__=='__main__':
    unittest.main()
