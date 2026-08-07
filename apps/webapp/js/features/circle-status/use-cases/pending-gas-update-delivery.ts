import type { GasOutboxEntry } from "../../event-day/public-api";

export interface PendingGasUpdateDelivery {
  deliver(update: GasOutboxEntry): Promise<void>;
}
