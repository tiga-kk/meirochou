import type { CircleDataPreview } from "../domain/circle-data-source-types";

/**
 * Cancels a pending CSV or GAS preview without changing persisted state.
 * The controller is responsible for removing the preview from its local map.
 */
export class CancelCircleDataPreviewUseCase {
  execute(preview: CircleDataPreview): void {
    // The use case itself is stateless; the preview map is owned by the controller.
    // This class exists to make cancellation a named operation with a clear interface.
    void preview;
  }
}
