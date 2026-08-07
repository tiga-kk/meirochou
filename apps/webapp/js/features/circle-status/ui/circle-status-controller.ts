import type {
  ChangeCircleStatusInput,
  ChangeCircleStatusResult,
  CircleStatus,
  CircleStatusUndoToken,
} from "../domain/circle-status-types";

interface CircleStatusChangeExecutor {
  execute(input: ChangeCircleStatusInput): ChangeCircleStatusResult;
}

interface CircleStatusUndoExecutor {
  execute(input: { readonly undoToken: CircleStatusUndoToken }): unknown;
}

export class CircleStatusController {
  private lastUndoToken: CircleStatusUndoToken | null = null;

  constructor(
    private readonly changeCircleStatus: CircleStatusChangeExecutor,
    private readonly undoCircleStatus: CircleStatusUndoExecutor,
  ) {}

  changeStatus(params: {
    eventDay: { eventId: string; dayId: string };
    circleSpace: string;
    nextStatus: CircleStatus;
    expectedSourceGeneration: string;
  }): ChangeCircleStatusResult {
    const result = this.changeCircleStatus.execute({
      ...params,
      changedAt: new Date().toISOString(),
    });
    this.lastUndoToken = result.undoToken;
    return result;
  }

  undo(): boolean {
    if (!this.lastUndoToken) return false;
    try {
      this.undoCircleStatus.execute({ undoToken: this.lastUndoToken });
      this.lastUndoToken = null;
      return true;
    } catch {
      this.lastUndoToken = null;
      return false;
    }
  }

  getLastUndoToken(): CircleStatusUndoToken | null {
    return this.lastUndoToken;
  }
}
