import type { CircleStateUndoToken, CircleVisitState } from "../types/domain";

/** タイムアウト後に自動クリアする1回限りの短時間取消トークン管理。 */
export class CircleStateUndoService {
  private token: CircleStateUndoToken | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  /** TTL（ミリ秒）。デフォルト5秒。 */
  readonly ttlMs: number;

  constructor(ttlMs = 5000) {
    this.ttlMs = ttlMs;
  }

  /**
   * 操作直後に取消トークンを発行する。
   * 既存トークンは破棄され、新しいタイマーがセットされる。
   */
  issue(
    space: string,
    before: CircleVisitState,
    after: CircleVisitState,
    nowMs: number,
  ): CircleStateUndoToken {
    this.clearPending();
    const token: CircleStateUndoToken = Object.freeze({
      space,
      before,
      after,
      createdAtMs: nowMs,
    });
    this.token = token;
    this.timeoutId = setTimeout(() => {
      if (this.token === token) {
        this.token = null;
      }
    }, this.ttlMs);
    return token;
  }

  /**
   * 現在有効なトークンを取得する。有効期限切れまたは存在しない場合は null。
   */
  getCurrentToken(): CircleStateUndoToken | null {
    return this.token;
  }

  /**
   * トークンを消費して返す。消費後はnullになる。
   * 呼び出し元はこのトークンを使って逆方向の setCircleState を呼ぶこと。
   */
  consume(): CircleStateUndoToken | null {
    const token = this.token;
    this.clearPending();
    return token;
  }

  /** タイマーとトークンを破棄する。 */
  clearPending(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.token = null;
  }
}
