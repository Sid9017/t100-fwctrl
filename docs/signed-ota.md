# T100 signed OAD contract (protocol 1)

Firmware source of truth: `projects/t100/docs/signed-web-oad.md` in bk-hw-temp.
The website implements the integrated protocol, not the earlier identify/ChunkX
proposal. No production deployment or real-device validation is implied by local
test results. First installation requires line-flashing the new merge_crc image
including the compatible BIM; the old TI service cannot bootstrap Chrome upgrades.

## Publication

POST `/api/ota/signed/latest`, `multipart/form-data`, exactly three fields:
`firmware` (final APP-only BIN), `manifest` (128 bytes), `metadata` (JSON).
Authorization: `Bearer <T100_OTA_UPLOAD_TOKEN>`.
Idempotency-Key: lowercase SHA256 of UTF-8
`workflow:runId:runAttempt:sha256:manifestSha256` (literal colon delimiters).

Metadata has exactly these fields:

```json
{
  "schemaVersion": 2,
  "protocolVersion": 1,
  "signingKeyId": 1,
  "releaseCounter": "281474976776193",
  "manifestSha256": "<64 lowercase hex>",
  "manifestSize": 128,
  "product": "t100",
  "kind": "oad",
  "version": "0x1234",
  "commitSha": "<40 lowercase hex>",
  "ref": "refs/heads/main",
  "workflow": ".github/workflows/t100-firmware.yml",
  "runId": "<decimal GitHub run ID>",
  "runNumber": 1,
  "runAttempt": 1,
  "builtAt": "2026-10-10T00:00:00Z",
  "size": 32,
  "sha256": "<64 lowercase hex>"
}
```

`releaseCounter` is a positive decimal **string**, never a JSON number.
It is `(epoch16 << 48) | (runNumber32 << 16) | runAttempt16`, with epoch > 0.
All comparisons and serialization preserve uint64 precision using BigInt.
Key ID 1 public key is pinned in `src/web/signed-ota-format.js` and must match
firmware `config/ota_trust.h`. HTTP upload token, binding auth8 and publishing
private key have distinct roles. Only the signer receives the private key.

The server independently verifies signature, both hashes, manifest fields and
BIN header/ROM/version/size, then atomically stores one matching pair plus metadata.
Conditional writes prevent concurrent rollback. Hash-only idempotency receipts do
not retain extra firmware copies. Lower counters and same-counter/different BIN
or manifest digests return 409. Invalid/auth/storage failures never acknowledge a
successful release. Both published and identical-retry responses use this receipt:

```json
{
  "ok": true,
  "status": "published",
  "schemaVersion": 2,
  "releaseCounter": "281474976776193",
  "manifestSha256": "<manifest digest>",
  "sha256": "<bin digest>"
}
```

Identical retry status is `unchanged`. There is no stale-success response.
GET `/api/ota/signed/latest` returns the metadata plus
`downloadUrl=/api/ota/signed/download/<sha256>/<manifestSha256>` and
`manifestUrl=/api/ota/signed/manifest/<sha256>/<manifestSha256>`.
After replacement both old pair URLs return 404. Browser retries metadata once
on either download's 404 and verifies both artifacts before selecting them.
The old `/api/ota/latest` and `/api/ota/download/*` routes are removed.

## Manifest

All integers are little endian except ECDSA r and s. Exact 128-byte format:

| Offset | Bytes | Value |
| --- | ---: | --- |
| 0 | 4 | ASCII TOTA |
| 4 | 1 | Schema 1 |
| 5 | 1 | APP kind 1 |
| 6 | 2 | Publishing key ID 1 |
| 8 | 4 | Complete BIN size, >16, <=245760, multiple of 16 |
| 12 | 2 | OAD BIN version (not 0xffff) |
| 14 | 2 | ROM 0x1235 |
| 16 | 8 | Monotonic release counter |
| 24 | 32 | SHA256 of complete BIN including original 16-byte header |
| 56 | 4 | ASCII T100 |
| 60 | 4 | Zero |
| 64 | 64 | P-256 raw big-endian r32 || s32 |

ECDSA uses SHA256 of manifest bytes 0..63, hashed once. BIN header UID is
0x42424242, header word length times 4 equals BIN size, and version/ROM agree with
manifest. Both browser and server verify this before device transfer.

## BLE

| Attribute | UUID | Properties |
| --- | --- | --- |
| Service | 0bb0e5f9-5b14-401c-a2a9-b2fa83eb0b5c | Primary |
| Control | 0bb0e5fc-5b14-401c-a2a9-b2fa83eb0b5c | Write with response |
| Data | 0bb0e5fb-5b14-401c-a2a9-b2fa83eb0b5c | Write with response |
| Status | 0bb0e5fd-5b14-401c-a2a9-b2fa83eb0b5c | Read / Notify |

1. Subscribe/read status. Flags bit0 and bit1 must both be set (key / compatible BIM).
   A previous ERROR can begin a fresh session; ERROR during the new transfer fails it.
2. Control `01 || auth8`, using current browser binding credential.
3. Eight control `02 || offset_u8 || 16-byte manifest fragment` writes, offsets 0..112.
4. Control `03`, wait for state 4 RECEIVE. ATT acknowledgment is not verification.
5. Data `offset_u32 || 16-byte BIN payload`, sequential offsets including header.
   Every write awaits its ATT response; MTU23-compatible 20-byte writes need no MTU
   assumptions. Lost data response triggers status.offset read, accepting confirmed
   advance or retrying only identical offset/data. Manifest ambiguity aborts.
6. After device offset equals full BIN size, control `04`; wait for state 6 COMMITTED.
   State 5 CHECK is still pending. A commit notification received before reset may
   confirm success even when reset loses the final ATT response. A disconnect
   without COMMITTED is a failure/ambiguous outcome, never a success.
7. On failure, best-effort control `05` ABORT if connected; disconnect also releases
   a noncommitted session. Reconnect and check DIS version after successful commit.

Status: 12 bytes, schema byte0=1, state byte1 (0 IDLE, 1 MANIFEST, 2 VERIFY,
3 ERASE, 4 RECEIVE, 5 CHECK, 6 COMMITTED, 7 ERROR), positive error byte2,
flags byte3, next offset u32 at 4, image size u32 at 8. Error codes 1 invalid/timeout,
2 untrusted, 3 rollback, 4 crypto, 5 Flash I/O, 6 digest mismatch. Notifications are
hints; reads can poll work completion. Device owns final verification and activation.
Business/factory reset does not intentionally erase its antirollback journal.
