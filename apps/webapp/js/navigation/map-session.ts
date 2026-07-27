import {
  createInitialNavigationState,
  type NavigationState,
} from "../state/navigation-state";

/** エリアごとの一時的なナビゲーションセッション。サークル訪問状態とは独立。 */
export interface MapSession {
  /** このセッションが対象とするエリアID。 */
  readonly areaId: string;
  /** 現在のナビゲーション状態（始点設定後にのみ navigating/atTarget になる）。 */
  readonly navigationState: NavigationState;
  /**
   * 直前の最適化計算で得た最良巡回順序のキャッシュ。
   * 同じエリアへ戻った際に再利用できる。null なら計算結果なし。
   */
  readonly cachedBestOrder: readonly string[] | null;
  /**
   * 距離行列のキャッシュ参照（Task 5実装予定）。
   * 同じエリアへ戻った際に再計算を省略できる。
   */
  readonly cachedMatrixRef: string | null;
}

/**
 * 指定エリアの新しいマップセッションを生成する。
 * ナビゲーションはidleから開始し、キャッシュはない。
 */
export function createMapSession(areaId: string): MapSession {
  return Object.freeze({
    areaId,
    navigationState: createInitialNavigationState(),
    cachedBestOrder: null,
    cachedMatrixRef: null,
  });
}

/**
 * 別エリアへ切り替えるか、同エリアへ戻る際のセッション境界を作る。
 *
 * - 別エリアへ切り替え: navigationをidleにリセット。キャッシュは引き継がない。
 * - 同エリアへ戻る (previousSessionを指定): navigationはidleにリセット（始点再設定が必要）。
 *   ただし previousSession のキャッシュ（matrix / best order）は再利用する。
 *
 * @param currentSession - 現在のセッション（切り替え元）
 * @param targetAreaId - 切り替え先エリアID
 * @param previousSession - 同エリアへ戻る際、以前のセッションを指定してキャッシュを引き継ぐ
 */
export function switchMapArea(
  _currentSession: MapSession,
  targetAreaId: string,
  previousSession?: MapSession | null,
): MapSession {
  // If there is a previous session for the target area, inherit its computation assets
  const sameAreaPrev =
    previousSession?.areaId === targetAreaId ? previousSession : null;
  const cachedBestOrder = sameAreaPrev?.cachedBestOrder
    ? Object.freeze([...sameAreaPrev.cachedBestOrder])
    : null;

  return Object.freeze({
    areaId: targetAreaId,
    navigationState: createInitialNavigationState(),
    cachedBestOrder,
    cachedMatrixRef: sameAreaPrev?.cachedMatrixRef ?? null,
  });
}

/**
 * セッションの cachedBestOrder と cachedMatrixRef を更新する。
 * Task 5/6 での最適化完了後に呼ぶ。
 */
export function updateSessionCache(
  session: MapSession,
  bestOrder: readonly string[],
  matrixRef: string | null,
): MapSession {
  return Object.freeze({
    ...session,
    cachedBestOrder: Object.freeze([...bestOrder]),
    cachedMatrixRef: matrixRef,
  });
}
