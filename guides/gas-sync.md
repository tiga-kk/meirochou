# GAS synchronization

ComiPath uses Google Apps Script as an optional circle source and a one-way
destination for purchase state. `LocalStorage` remains authoritative for
activity on the current device.

## Network behavior

- Opening cached state performs no implicit GAS GET.
- Initial import and an explicit refresh fetch circle data only after a user
  action.
- Source changes and refreshes produce a preview that must be applied.
- Purchase changes are saved locally before any POST begins.

The client accepts only a deployed Google Apps Script Web App URL with the
expected HTTPS origin and path shape. The full deployed URL belongs only in the
user's local settings and is never committed to this repository.

## Requests

Sheet discovery uses `?action=getSheets`. Circle retrieval uses
`?sheets=<url-encoded-sheetName>`. Successful responses include `ok`, `status`,
and the expected sheet or circle payload.

Purchase POST requests assign an explicit desired state; they do not toggle
remote state. Repeating a request is therefore safe when a remote success is
followed by a local queue-save failure.

## Outbox and retry

Each `gasOutbox` entry captures the event/day, `sourceGeneration`, GAS URL,
`sheetName`, space, and desired purchase state that existed when it was
created.

- Entries are processed FIFO per event/day.
- A single event/day cannot run duplicate concurrent processors.
- A failed entry remains pending with a redacted error category.
- Startup and browser `online` events retry pending event/day queues.
- Never-attempted tail entries for the same target may be coalesced to the
  latest desired state.

Pending entries block affected source changes and deletion. Discarding pending
entries abandons only unsent remote copies; it does not roll back local
purchase truth.

## Public GAS source

The public Apps Script source is generated deterministically:

```bash
npm run build:gas
```

See `integrations/gas-spreadsheet/README.md` for the required sheet columns,
deployment steps, and request contract. The repository does not contain a
deployed endpoint, spreadsheet identifier, or credential.
