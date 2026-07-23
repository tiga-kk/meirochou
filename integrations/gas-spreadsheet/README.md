# ComiPath GAS Spreadsheet Integration

This directory contains the Google Apps Script (GAS) web application source for synchronizing ComiPath circle check-lists and purchase statuses with a Google Spreadsheet.

> **Notice**: This repository does NOT provide a pre-deployed public GAS WebApp URL. Users must build and deploy their own `Code.gs` script to their personal Google Spreadsheet.

## Build and Regeneration

To generate the single combined `Code.gs` script deterministically from source files in `src/`:

```bash
npm run build:gas
```

The output file `integrations/gas-spreadsheet/Code.gs` is generated from the source files.

## Spreadsheet Structure & Columns

Each event/day uses exactly one selected spreadsheet sheet (`sheetName`). The selected sheet must contain a header row with these exact, case-sensitive column names:

- **`space`**: Circle space code (e.g. `東ア23a`). Required.
- **`priority`**: Priority number. Optional.
- **`isSale`**: Purchase status. Optional for GET, but required for sale POST updates.
- **`account`**: Profile URL. Optional.
- **`tweet`**: Tweet or image link. Optional.
- **`memo`**: Circle memo text. Optional.

Unknown columns are ignored. Duplicate recognized headers and rows without a `space` value are rejected.

## Deployment Steps

1. Run `npm run build:gas` to produce `Code.gs`.
2. Open your Google Spreadsheet for the event.
3. Open **Extensions** → **Apps Script**.
4. Paste the contents of `Code.gs` into the Apps Script editor.
5. Click **Deploy** → **New Deployment**.
   - **Select type**: Web app
   - **Execute as**: Me
   - **Who has access**: Anyone
6. Copy the resulting WebApp URL. It must match this URL shape:
   `https://script.google.com/macros/s/<deployment-id>/exec`
7. Paste this URL into your ComiPath application's local settings. The deployed URL belongs only in that user's local settings and is stored in the browser's `LocalStorage`; it is not supplied by this repository.

The client uses `GET <local WebApp URL>?action=getSheets` to list sheet names and `GET <local WebApp URL>?sheets=<url-encoded-sheetName>` to fetch one selected sheet. Purchases use a one-way `POST` with a JSON body containing `action: "sale"`, `sheetName`, `space`, and boolean `undo`.

## Data Synchronization & Queueing

- **Explicit Refresh**: Circle data is fetched on initial import or when triggering an `explicit refresh`; opening cached state does not issue a GET.
- **Local-First & Outbox Queue**: Purchases update `LocalStorage` immediately. Remote sale POST requests are queued in `gasOutbox` and retried automatically.
- **Version Tracking**: `sourceGeneration` tracks data versions across updates.
