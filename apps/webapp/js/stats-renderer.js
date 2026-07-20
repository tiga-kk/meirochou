import { Config } from "./config.js";
import { TspSolver } from "./tsp-solver.js";

/**
 * 統計情報描画クラス
 * 残り件数・保留件数テーブルの更新を担当
 */
export class StatsRenderer {
  constructor(uiManager) {
    this.uiManager = uiManager; // クリックイベント連携用
    this.tableEl = document.getElementById("stats-table");
    this.areaCells = {}; // { "areaName_type": element }
    this.onHoldListReset = null; // コールバック
  }

  /**
   * 初期化（DOM要素生成とイベント設定）
   */
  init() {
    if (!this.tableEl) return;
    this.renderTable();
  }

  /**
   * テーブルの動的生成
   */
  renderTable() {
    this.tableEl.innerHTML = "";
    this.areaCells = {};

    const areas = Config.AREAS || []; // フォールバック対応は省略（Config修正済み前提）

    // THEAD
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    // 左上の空セル
    const thEmpty = document.createElement("th");
    headerRow.appendChild(thEmpty);

    areas.forEach((area) => {
      const th = document.createElement("th");
      th.textContent = area.name;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    this.tableEl.appendChild(thead);

    // TBODY
    const tbody = document.createElement("tbody");

    // 残り件数行
    const remainingRow = document.createElement("tr");
    const tdRemLabel = document.createElement("td");
    tdRemLabel.className = "status-label";
    tdRemLabel.textContent = "残り";
    remainingRow.appendChild(tdRemLabel);

    areas.forEach((area) => {
      const td = document.createElement("td");
      td.textContent = "0";
      td.onclick = () => {
        if (td.classList.contains("count-cell")) {
          this.uiManager.showGallery(area.name, false);
        }
      };
      remainingRow.appendChild(td);
      this.areaCells[`${area.name}_remaining`] = td;
    });
    tbody.appendChild(remainingRow);

    // 保留件数行
    const holdRow = document.createElement("tr");
    holdRow.className = "hold-row"; // スタイリング用

    const tdHoldLabel = document.createElement("td");
    tdHoldLabel.className = "status-label warning";
    tdHoldLabel.textContent = "保留";
    // ラベルクリックでリセット
    tdHoldLabel.onclick = (e) => {
      e.stopPropagation();
      if (this.onHoldListReset) this.onHoldListReset();
    };
    holdRow.appendChild(tdHoldLabel);

    areas.forEach((area) => {
      const td = document.createElement("td");
      td.textContent = "0";
      td.onclick = (e) => {
        e.stopPropagation();
        if (td.classList.contains("count-cell")) {
          this.uiManager.showGallery(area.name, true);
        }
      };
      holdRow.appendChild(td);
      this.areaCells[`${area.name}_hold`] = td;
    });
    tbody.appendChild(holdRow);

    this.tableEl.appendChild(tbody);
  }

  /**
   * カウントの更新
   * @param {DataManager} dm
   */
  updateCounts(dm) {
    const unvisited = dm.getUnvisited();
    const counts = {}; // { "areaName": count }
    const holdCounts = {}; // { "areaName": count }

    // 初期化
    if (Config.AREAS) {
      Config.AREAS.forEach((area) => {
        counts[area.name] = 0;
        holdCounts[area.name] = 0;
      });
    }

    // 未訪問カウント
    unvisited.forEach((c) => {
      const [key] = TspSolver.parseSpace(c.space);
      if (counts[key] !== undefined) counts[key]++;
    });

    // 保留カウント
    dm.holdList.forEach((space) => {
      const [key] = TspSolver.parseSpace(space);
      if (holdCounts[key] !== undefined) holdCounts[key]++;
    });

    const updateCell = (type, areaName, count) => {
      const cell = this.areaCells[`${areaName}_${type}`];
      if (!cell) return;

      cell.textContent = count;
      if (count > 0) {
        cell.classList.add("count-cell");
      } else {
        cell.classList.remove("count-cell");
      }
    };

    if (Config.AREAS) {
      Config.AREAS.forEach((area) => {
        updateCell("remaining", area.name, counts[area.name]);
        updateCell("hold", area.name, holdCounts[area.name]);
      });
    }
  }

  /**
   * 保留リストリセット時のコールバック設定
   */
  setOnHoldListReset(callback) {
    this.onHoldListReset = callback;
  }
}
