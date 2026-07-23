# ComiPath data contracts

ComiPath stores event/day data in the browser. `LocalStorage` is the
single-device source of truth; no multi-device merge or server-side backup is
provided.

## Event/day identity

`eventId` and `dayId` must match
`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`. Each pair has an isolated state:

```text
comipath:v1:<eventId>:<dayId>:state
```

The repository also maintains an event/day index and the last-opened reference.

## Persisted state

Schema version 1 stores:

- one CSV or GAS source;
- a `sourceGeneration` identifying the current source snapshot;
- circle records;
- purchased and held space identifiers;
- undo and redo history;
- a persistent `gasOutbox`;
- creation, update, and source-update timestamps.

A GAS source is identified by its validated Web App URL and `sheetName`.
Changing or replacing a source creates a new `sourceGeneration`; applying an
explicit refresh of the same source does not.

## Source previews

CSV replacement and GAS import, replacement, or refresh are previewed before
they are applied. GAS previews are memory-only and expire. Apply rejects a
preview when its event/day, source generation, source snapshot, or lifetime no
longer matches current state.

## Local-first activity

Purchase, cancellation, undo, redo, and reset first save the complete local
state. For a GAS source, the desired remote purchase state is appended to
`gasOutbox` in that same repository save. Hold changes never enqueue GAS work.

If the local save fails, the user-visible mutation does not succeed. If a later
network operation fails, local truth remains and the queued entry is retained.

## CSV boundary

CSV import validates the public circle fields before applying a preview. CSV
export and management controls are described only when their user-facing
implementation is available.
