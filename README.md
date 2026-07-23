# ComiPath Public Webapp

ComiPath is a modern web application designed for Comiket attendees to manage circle check-lists, route navigation, and purchase status across event days.

## Overview

- **Local-First Architecture**: Circle lists and purchase activities are stored in `LocalStorage` for immediate availability and offline navigation.
- **CSV Support**: Standalone CSV-only users do not need Google Apps Script (GAS) or external network services.
- **Optional GAS Synchronization**: Users who prefer Google Spreadsheet synchronization can build and deploy their own `Code.gs` script.

## Data Synchronization & Reliability

- **No Implicit GET**: Opening cached state in the application performs no automatic GET requests to remote servers.
- **Explicit Refresh**: Remote data updates require an `explicit refresh` operation.
- **Local-First Purchases**: Marking a circle as purchased or cancelling a purchase writes to `LocalStorage` first.
- **Persistent Queue (`gasOutbox`)**: If a network failure occurs during remote synchronization, pending changes remain in the local `gasOutbox` queue and are automatically retried when online.
- **Source Safety (`sourceGeneration` & `sheetName`)**: Data sources are version-tracked to prevent state mismatch or accidental data overwriting.

## Building Google Apps Script Integration

GAS integration code is located in `integrations/gas-spreadsheet/`. To generate the single-file `Code.gs` bundle for deployment:

```bash
npm run build:gas
```

Deploy your generated `Code.gs` to your Google Apps Script project as a WebApp and configure the WebApp URL in local settings.

## Development Status

Phase 3 provides full background service and browser data synchronization mechanics. User interface components for managing outbox queues and source settings will be introduced in Phase 4.
