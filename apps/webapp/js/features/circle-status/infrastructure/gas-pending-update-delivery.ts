import { GasApiClient } from "../../../api/gas-api-client";
import type { GasOutboxEntry } from "../../event-day/public-api";
import type { PendingGasUpdateDelivery } from "../use-cases/pending-gas-update-delivery";

export class GasPendingUpdateDelivery implements PendingGasUpdateDelivery {
  constructor(private readonly client: GasApiClient = new GasApiClient()) {}

  async deliver(update: GasOutboxEntry): Promise<void> {
    await this.client.sendSaleUpdate(update.gasUrl, {
      action: "sale",
      sheetName: update.sheetName,
      space: update.space,
      undo: !update.purchased,
    });
  }
}
