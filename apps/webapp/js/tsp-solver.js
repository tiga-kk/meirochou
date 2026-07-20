import { Config } from "./config.js";

/**
 * 経路計算ロジッククラス
 */
// biome-ignore lint/complexity/noStaticOnlyClass: class contains static utility methods
export class TspSolver {
  /**
   * 全角数字等を半角に変換
   */
  static toHalfWidth(str) {
    if (!str) return "";
    return str.replace(/[！-～]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xfee0),
    );
  }

  /**
   * スペース文字列を解析
   * @param {string} space - 解析対象のスペース記号 (例: "東A23a")
   * @returns {[string, string, number]} [ホール群名(name), 識別子, 番号]
   */
  static parseSpace(space) {
    if (!space || typeof space !== "string") return ["", "", 0];

    // 前後の空白削除と全角英数字の半角化
    const cleanedSpace = TspSolver.toHalfWidth(space.trim());
    if (cleanedSpace.length < 2) return ["", "", 0];

    const prefixChar = cleanedSpace[0];
    const labelChar = cleanedSpace[1];
    const numberPart = cleanedSpace.substring(2);

    let hallGroup = "";

    // Config.AREAS を使用して動的に判定
    if (Config.AREAS) {
      for (const area of Config.AREAS) {
        // prefixが一致するか
        const prefixMatch = area.prefixes
          ? area.prefixes.includes(prefixChar)
          : true;
        if (prefixMatch && area.labels.includes(labelChar)) {
          hallGroup = area.name; // 既存ロジックとの互換性のため name を返す
          break;
        }
      }
    }

    let numStr = "";
    for (let i = 0; i < numberPart.length; i++) {
      if (numberPart[i] >= "0" && numberPart[i] <= "9") numStr += numberPart[i];
      else break;
    }
    return [hallGroup, labelChar, parseInt(numStr, 10) || 0];
  }

  /**
   * 2点間のコスト（距離）を計算
   */
  static calcDist(spaceA, spaceB) {
    const [h1, l1, n1] = TspSolver.parseSpace(spaceA);
    const [h2, l2, n2] = TspSolver.parseSpace(spaceB);
    if (!h1 || !h2 || h1 !== h2) return 10000;
    if (!l1 || !l2) return 10000;
    const num1 = n1 > 32 ? 64 - n1 : n1;
    const num2 = n2 > 32 ? 64 - n2 : n2;
    const labelDist = Math.abs(l1.charCodeAt(0) - l2.charCodeAt(0));
    const numDist = Math.abs(num1 - num2);
    return labelDist * 7 + numDist;
  }

  /**
   * TSPを解く（Nearest Neighbor法）
   * @param {string} startSpace 開始地点のスペース名
   * @param {Array} candidates 候補リスト
   */
  static solve(startSpace, candidates) {
    if (candidates.length === 0) return [];

    const nodes = [{ space: startSpace, isStart: true }, ...candidates];

    // 簡易的なNearest Neighbor法（モバイルでの速度優先）
    const path = [nodes[0]];
    const visited = new Set([0]);

    let currentIdx = 0;

    while (path.length < nodes.length) {
      let minDist = Infinity;
      let nextIdx = -1;

      for (let i = 1; i < nodes.length; i++) {
        if (visited.has(i)) continue;

        const d = TspSolver.calcDist(nodes[currentIdx].space, nodes[i].space);
        if (d < minDist) {
          minDist = d;
          nextIdx = i;
        }
      }

      if (nextIdx !== -1) {
        path.push(nodes[nextIdx]);
        visited.add(nextIdx);
        currentIdx = nextIdx;
      } else {
        break;
      }
    }

    return path; // [StartNode, FirstTarget, SecondTarget...]
  }
}
