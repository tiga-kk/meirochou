import "./components/comipath-settings";
import { Config } from "./config.js";
import { DataManager } from "./data-manager.js";
import { createDevDemoData, isDevDemoEnabled } from "./dev-demo-data.js";
import {
  loadMapBundleManifest,
  renderMapBootstrapError,
} from "./map-manifest-loader";
import { planRoute, rankCandidatesByGridDistance } from "./route-planner";
import { TspSolver } from "./tsp-solver.js";
import { parseGridMeta, parsePointsPayload } from "./types/boundary-parsers";
import { buildSpaceFromLocation } from "./ui/navigation-view-model";
import { UIManager } from "./ui-manager.js";

function findAreaForSpace(space) {
  if (!space || typeof space !== "string") return null;

  const cleanedSpace = space.trim();
  if (cleanedSpace.length < 2) return null;

  const prefixChar = cleanedSpace[0];
  const labelChar = cleanedSpace[1];

  return (
    Config.AREAS.find(
      (area) =>
        area.prefixes.includes(prefixChar) && area.labels.includes(labelChar),
    ) || null
  );
}

function areSpacesInSameArea(spaceA, spaceB) {
  const areaA = findAreaForSpace(spaceA);
  const areaB = findAreaForSpace(spaceB);
  return Boolean(areaA && areaB && areaA.id === areaB.id);
}

/**
 * アプリケーションのメインコントローラー
 */
export class App {
  constructor() {
    this.dm = new DataManager();
    this.ui = new UIManager();
    this.currentTarget = null;
    this.currentRoute = null;
    this.currentStartSpace = "";
    this.nextTarget = null;
    this.selectedTarget = null;
    this.selectedRoute = null;
    this.selectionState = "idle";
    this.selectionMessage = "";
    this.selectionToken = 0;
    this.routeAssetsCache = new Map();
  }

  /**
   * 初期化実行
   */
  async init(manifest) {
    const devDemoEnabled = isDevDemoEnabled(window.location);
    if (devDemoEnabled) {
      const demoData = createDevDemoData();
      this.dm.wantToBuy = demoData.wantToBuy;
      this.dm.spreadsheetTitle = demoData.spreadsheetTitle;
      this.dm.purchasedList = demoData.purchasedList;
      this.dm.holdList = demoData.holdList;
    } else {
      // 初期イベント/日を開く
      let activeRef = this.dm.repository.getLastOpened();
      if (!activeRef) {
        if (manifest) {
          activeRef = {
            eventId: manifest.eventId,
            dayId: "day1",
          };
        } else {
          activeRef = { eventId: "demo-v1", dayId: "day1" };
        }
      }

      try {
        await this.dm.openEventDay(activeRef);
      } catch (error) {
        console.error("Failed to open initial event day:", error);
        const defaultRef = { eventId: "demo-v1", dayId: "day1" };

        // Already tried to open the default and failed, or we retry
        const isAlreadyDefault =
          activeRef.eventId === defaultRef.eventId &&
          activeRef.dayId === defaultRef.dayId;

        if (isAlreadyDefault) {
          renderMapBootstrapError(document, error);
          return;
        }

        try {
          console.warn(
            "Attempting fallback to default event day (demo-v1/day1)",
          );
          await this.dm.openEventDay(defaultRef);
        } catch (fallbackError) {
          console.error("Failed to open fallback event day:", fallbackError);
          renderMapBootstrapError(document, fallbackError);
          return;
        }
      }
    }

    this.ui.init(this.dm, {
      onSetNextTarget: (circle) => this.handleSetNextTarget(circle),
      onSelectTarget: (circle) => this.handleSelectTarget(circle),
      onPreviewRoute: () => this.handlePreviewRoute(),
      onConfirmRoute: () => this.handleConfirmRoute(),
      onCancelRoute: () => this.handleCancelRoute(),
    });
    this.setupEvents();

    if (devDemoEnabled) {
      this.ui.updateCounts(this.dm);
      this.ui.showToast("UIデモデータを表示中");
      this.searchNext();
      return;
    }

    this.ui.updateCounts(this.dm);

    // データがあれば初期表示
    if (this.dm.wantToBuy.length > 0) {
      this.ui.showToast("データ読み込み済み");
      this.searchNext("", false);
    } else {
      this.ui.showToast("CSVデータ未設定。空のイベント・日程で起動しました");
    }
  }

  /** Build the complete render contract shared by the sheet and map. */
  getNavigationContext(fitMode = "preserve") {
    return {
      currentTarget: this.currentTarget,
      currentRoute: this.currentRoute,
      selectedTarget: this.selectedTarget || this.currentTarget,
      selectedRoute: this.selectedRoute,
      startSpace: this.currentStartSpace,
      nextTarget: this.nextTarget,
      selectionState: this.selectionState,
      selectionMessage: this.selectionMessage,
      fitMode,
    };
  }

  /** Copy exact grid distance and adopted endpoint onto a circle view model. */
  targetWithRoute(target, route) {
    if (!target || !route) return target;
    return {
      ...target,
      gridDistance: Math.round(route.cost),
      mapPosition: route.targetPosition,
    };
  }

  /** Resolve an exact same-area route using cached, runtime-validated assets. */
  async planGridRoute(startSpace, targetSpace, options = {}) {
    if (!areSpacesInSameArea(startSpace, targetSpace)) return null;
    const area = findAreaForSpace(startSpace);
    const assets = await this.loadGridRouteAssets(area);
    if (!assets) return null;
    return planRoute(
      assets.pointsPayload,
      assets.gridMeta,
      assets.gridBytes,
      startSpace,
      targetSpace,
      options,
    );
  }

  /** Select a pin without changing the active destination or route. */
  async handleSelectTarget(circle) {
    if (!circle || this.selectionState === "comparing") return;

    const token = ++this.selectionToken;
    this.selectedTarget = circle;
    this.selectedRoute = null;
    this.selectionState = "loading";
    this.selectionMessage = "候補経路を計算中…";
    this.ui.showNavigation(this.getNavigationContext("preserve"));

    if (
      !this.currentRoute ||
      !areSpacesInSameArea(this.currentStartSpace, circle.space)
    ) {
      if (token !== this.selectionToken) return;
      this.selectionState = "error";
      this.selectionMessage = "同じ地図エリアの正式な経路を計算できません";
      this.ui.showNavigation(this.getNavigationContext("preserve"));
      return;
    }

    try {
      const route = await this.planGridRoute(
        this.currentStartSpace,
        circle.space,
        { startPosition: this.currentRoute.startPosition },
      );
      if (token !== this.selectionToken) return;
      if (!route) {
        this.selectionState = "error";
        this.selectionMessage = "候補地点までの経路を探索できません";
      } else {
        this.selectedRoute = route;
        this.selectedTarget = this.targetWithRoute(circle, route);
        this.selectionState =
          circle.space === this.currentTarget?.space ? "idle" : "ready";
        this.selectionMessage = "";
      }
    } catch (error) {
      if (token !== this.selectionToken) return;
      console.warn("Selected target route could not be calculated.", error);
      this.selectionState = "error";
      this.selectionMessage =
        "候補経路の読込に失敗しました。もう一度お試しください";
    }

    const fitMode = this.selectionState === "ready" ? "comparison" : "preserve";
    this.ui.showNavigation(this.getNavigationContext(fitMode));
  }

  /** Enter the two-route comparison state after a candidate route is ready. */
  handlePreviewRoute() {
    if (this.selectionState !== "ready" || !this.selectedRoute) return;
    this.selectionState = "comparing";
    this.ui.showNavigation(this.getNavigationContext("comparison"));
  }

  /** Promote the compared candidate to the active destination without recalculation. */
  handleConfirmRoute() {
    if (
      this.selectionState !== "comparing" ||
      !this.selectedTarget ||
      !this.selectedRoute
    )
      return;
    this.currentTarget = this.selectedTarget;
    this.currentRoute = this.selectedRoute;
    this.nextTarget = null;
    this.selectionState = "idle";
    this.selectionMessage = "";
    this.ui.showNavigation(this.getNavigationContext("current"));
    this.ui.showToast(`目的地を ${this.currentTarget.space} に変更しました`);
  }

  /** Leave comparison while retaining the selected target details. */
  handleCancelRoute() {
    if (this.selectionState !== "comparing") return;
    this.selectionState = "ready";
    this.ui.showNavigation(this.getNavigationContext("comparison"));
  }

  /**
   * 手動で目的地を設定
   */
  async handleSetNextTarget(circle) {
    if (!circle) return;

    this.selectionToken += 1;
    const currentSpace = this.readCurrentSpace();
    if (!currentSpace) return;

    this.ui.showLoading();
    let gridTarget = null;
    let route = null;
    try {
      [gridTarget] =
        (await this.rankCandidatesByGrid(currentSpace, [circle])) || [];
      route = await this.planGridRoute(currentSpace, circle.space);
    } catch (error) {
      console.warn(
        "Selected target grid distance could not be calculated.",
        error,
      );
    }
    this.currentStartSpace = currentSpace;
    this.currentRoute = route;
    this.currentTarget = this.targetWithRoute(gridTarget || circle, route);
    this.selectedTarget = this.currentTarget;
    this.selectedRoute = route;
    this.nextTarget = null;
    this.selectionState = "idle";
    this.selectionMessage = "";
    this.ui.showNavigation(this.getNavigationContext("current"));
    this.ui.showToast(`目的地を ${circle.space} に設定しました`);
  }

  readCurrentSpace() {
    const areaId = document.getElementById("loc-ewsn").value;
    const area = Config.AREAS.find((candidate) => candidate.id === areaId);
    const currentSpace = buildSpaceFromLocation({
      areaName: area?.prefixes[0] || "",
      label: document.getElementById("loc-label").value,
      number: document.getElementById("loc-number").value,
    });

    if (!currentSpace) {
      this.ui.showToast("現在地の番号は1〜99で入力してください");
    }
    return currentSpace;
  }

  /**
   * イベントリスナーの設定
   */
  setupEvents() {
    // 設定ボタン
    document.getElementById("toggle-settings").onclick = () =>
      this.ui.toggleSettings(document.getElementById("toggle-settings"));

    const btnOpenGallery = document.getElementById("btn-open-gallery");
    if (btnOpenGallery) {
      btnOpenGallery.onclick = () => {
        const areaId = document.getElementById("loc-ewsn").value;
        const area = Config.AREAS.find((candidate) => candidate.id === areaId);
        this.ui.showGallery(area?.name || areaId, false);
      };
    }

    const settings = this.ui.els.settingsArea;
    settings.addEventListener("settings-fetch-sheets-request", async () => {
      this.ui.setSettingsError("GAS同期はPhase 2では利用できません");
      this.ui.showToast("GAS同期はPhase 2では利用できません");
    });

    settings.addEventListener("settings-refresh-request", async () => {
      this.ui.setSettingsError("GAS同期はPhase 2では利用できません");
      this.ui.showToast("GAS同期はPhase 2では利用できません");
    });

    // 各種ボタンアクション
    document.getElementById("btn-search").onclick = () => this.searchNext();

    document.getElementById("btn-purchased").onclick = () =>
      this.handleAction("purchase");
    document.getElementById("btn-hold").onclick = () =>
      this.handleAction("hold");

    // Undo / Redo
    document.getElementById("btn-undo").onclick = () => this.handleUndo();
    document.getElementById("btn-redo").onclick = () => this.handleRedo();

    document.getElementById("btn-reset-all").onclick = () => this.handleReset();

    // 保留リストリセットのコールバック設定 (StatsRenderer経由)
    if (this.ui.statsRenderer) {
      this.ui.statsRenderer.setOnHoldListReset(() => {
        this.handleResetHold();
      });
    }
  }

  /**
   * データ更新処理
   */
  async refreshData(force = false) {
    void force;
    this.ui.setSettingsError("GAS同期はPhase 2では利用できません");
    this.ui.showToast("GAS同期はPhase 2では利用できません");
  }

  async loadGridRouteAssets(area) {
    if (!area?.pointsFile || !area?.gridMetaFile || !area?.gridFile)
      return null;

    const cached = this.routeAssetsCache.get(area.id);
    if (cached !== undefined) return cached;

    const loadPromise = Promise.all([
      fetch(area.pointsFile).then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load ${area.pointsFile}: ${response.status}`,
          );
        }
        return response.json().then(parsePointsPayload);
      }),
      fetch(area.gridMetaFile).then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load ${area.gridMetaFile}: ${response.status}`,
          );
        }
        return response.json().then(parseGridMeta);
      }),
      fetch(area.gridFile).then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load ${area.gridFile}: ${response.status}`,
          );
        }
        return response.arrayBuffer();
      }),
    ])
      .then(([pointsPayload, gridMeta, gridBuffer]) => ({
        pointsPayload,
        gridMeta,
        gridBytes: new Uint8Array(gridBuffer),
      }))
      .catch((error) => {
        console.warn("Grid distance assets could not be loaded.", error);
        return null;
      });

    this.routeAssetsCache.set(area.id, loadPromise);
    const assets = await loadPromise;
    this.routeAssetsCache.set(area.id, assets);
    return assets;
  }

  async rankCandidatesByGrid(currentSpace, candidates) {
    const area = findAreaForSpace(currentSpace);
    if (!area) return null;

    const sameAreaCandidates = [];
    const otherCandidates = [];
    candidates.forEach((candidate) => {
      if (areSpacesInSameArea(currentSpace, candidate?.space)) {
        sameAreaCandidates.push(candidate);
      } else {
        otherCandidates.push(candidate);
      }
    });
    if (sameAreaCandidates.length === 0) return null;

    const assets = await this.loadGridRouteAssets(area);
    if (!assets) return null;

    const ranked = rankCandidatesByGridDistance(
      assets.pointsPayload,
      assets.gridMeta,
      assets.gridBytes,
      currentSpace,
      sameAreaCandidates,
    );
    const reachable = ranked
      .filter((item) => Number.isFinite(item.distance))
      .map((item) => ({
        ...item.candidate,
        gridDistance: Math.round(item.distance),
        ...(item.position ? { mapPosition: item.position } : {}),
      }));

    if (reachable.length === 0) return null;

    const unreachable = ranked
      .filter((item) => !Number.isFinite(item.distance))
      .map((item) => item.candidate);
    const fallbackRemainder = TspSolver.solve(currentSpace, [
      ...unreachable,
      ...otherCandidates,
    ]).slice(1);

    return [...reachable, ...fallbackRemainder];
  }

  /**
   * 次の目的地検索処理
   */
  searchNext(startSpace = "", notifyComplete = true) {
    if (this.dm.wantToBuy.length === 0) {
      this.ui.showToast("データがありません");
      return;
    }

    const currentSpace = startSpace || this.readCurrentSpace();
    if (!currentSpace) return;

    this.selectionToken += 1;
    this.ui.showLoading();

    // UI描画をブロックしないように非同期実行
    setTimeout(async () => {
      const candidates = this.dm.getUnvisited();
      if (candidates.length === 0) {
        this.currentTarget = null;
        this.currentRoute = null;
        this.selectedTarget = null;
        this.selectedRoute = null;
        this.ui.showTarget(null);
        if (notifyComplete) this.ui.showToast("全てのサークルを回りました！");
        return;
      }

      const gridRanked = await this.rankCandidatesByGrid(
        currentSpace,
        candidates,
      );
      const path = gridRanked
        ? [{ space: currentSpace, isStart: true }, ...gridRanked]
        : TspSolver.solve(currentSpace, candidates);

      // path[0]は現在地、path[1]が次の目的地
      if (path.length > 1) {
        const route = await this.planGridRoute(currentSpace, path[1].space);
        this.currentStartSpace = currentSpace;
        this.currentRoute = route;
        this.currentTarget = this.targetWithRoute(path[1], route);
        this.nextTarget = path.length > 2 ? path[2] : null;
        this.selectedTarget = this.currentTarget;
        this.selectedRoute = route;
        this.selectionState = "idle";
        this.selectionMessage = "";
        this.ui.showNavigation(this.getNavigationContext("current"));
      }
    }, 50);
  }

  /**
   * 購入・保留アクション
   */
  async handleAction(type) {
    if (this.selectionState === "comparing") return;
    const actionTarget = this.selectedTarget || this.currentTarget;
    if (!actionTarget) return;

    const space = actionTarget.space;
    const sheetName = actionTarget.sheetName || "";
    if (type === "purchase") {
      this.dm.addPurchased(space, sheetName);
      this.ui.showToast(`${space} 購入！`);
    } else {
      this.dm.addHold(space, sheetName);
      this.ui.showToast(`${space} 保留`);
    }

    this.ui.updateCounts(this.dm);
    this.ui.updateCurrentLocation(space); // 現在地を更新
    this.searchNext(space, false); // 到着地点から自動で次を検索
  }

  /**
   * 取り消し処理
   */
  async handleUndo() {
    const action = this.dm.undoLastAction();
    if (action) {
      this.ui.showToast(`${action.space} の操作を取り消しました`);
      this.ui.updateCounts(this.dm);
      this.ui.updateCurrentLocation(action.space); // 現在地を元に戻す
      // 画面は更新しない（現在地が変わっていないため）
    } else {
      this.ui.showToast("履歴がありません");
    }
  }

  /**
   * やり直し処理 (Redo)
   */
  async handleRedo() {
    const action = this.dm.redoAction();
    if (action) {
      this.ui.showToast(`${action.space} の操作をやり直しました`);
      this.ui.updateCounts(this.dm);
      this.ui.updateCurrentLocation(action.space); // 現在地を更新
      this.searchNext(action.space); // 到着地点から次を自動検索
    } else {
      this.ui.showToast("やり直す操作がありません");
    }
  }

  /**
   * 全リセット処理
   */
  handleReset() {
    if (confirm("本当にリセットしますか？")) {
      this.dm.resetAll();
      this.ui.updateCounts(this.dm);
      this.ui.showTarget(null); // 表示クリア
      this.ui.els.targetSection.classList.add("hidden");
      this.ui.els.targetEmpty.classList.remove("hidden");
      this.ui.showToast("リセットしました");
    }
  }

  /**
   * 保留リセット処理
   */
  handleResetHold() {
    if (this.dm.holdList.length === 0) return;
    if (confirm("保留リストをクリアしますか？")) {
      this.dm.resetHold();
      this.ui.updateCounts(this.dm);
      this.ui.showToast("保留リストをクリアしました");
    }
  }
}

/** Load the selected map bundle before creating any stateful app services. */
async function bootstrapApp() {
  let manifest;
  try {
    manifest = await loadMapBundleManifest();
    Config.initializeAreas(manifest.areas);
  } catch (error) {
    console.error("Map bundle initialization failed.", error);
    renderMapBootstrapError(document, error);
    return;
  }

  const app = new App();
  await app.init(manifest);
}

// アプリ起動
document.addEventListener("DOMContentLoaded", () => {
  void bootstrapApp();
});
