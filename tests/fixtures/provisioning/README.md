# Real-device barcode fixture

`kcalack-device-barcode.jpg` is the replacement, unmodified photo supplied on
2026-10-14. It stays outside the Mini Program package.

Verified directly from the original image with ZXing-C++ (no crop required):

- Format: Code 128
- Payload: `0r3<$G8x&`
- Device name: `YD-03148c52fb00`
- Shell ID: `01`
- Schema: `1`

The decoded payload was passed through the Mini Program's production
`decodeProvisioningBarcode` function. The expected result is stored in
`kcalack-device-barcode.json` and covered by `tests/wechat-provisioning.test.js`.

A live Mac BLE scan on 2026-10-14 found the exact advertised name at -54 dBm.
A read-only connection succeeded, exposed FEE0, and returned FEE5 status plus
firmware `1.0.0-ea98`. The test disconnected after reading; it did not bind,
reset, flash firmware, or change device settings. The verification was image
decoding plus Mac BLE, not an end-to-end test of the phone's WeChat camera.

A factory reset can replace the device identity. Always compare the decoded
barcode with current advertisements; do not connect to a different nearby unit.
This fixture contains no binding auth credential.
