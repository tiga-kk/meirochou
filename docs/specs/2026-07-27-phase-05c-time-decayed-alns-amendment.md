# Phase 5C Time-Decayed ALNS Design Amendment

**Date:** 2026-07-27  
**Status:** Approved  
**Applies to:** Phase 5C Tasks 6-10  
**Supersedes:** `2026-07-26-phase-05bc-real-map-routing-design.md` のTOPTW、時間予算、Python参照実装に関する条項

## 1. Decision

Phase 5Cの順路最適化は、時間制限付きTOPTWではなく、各サークルの価値を購入完了時刻に応じて減衰させ、その合計を最大化するALNSとする。

- 地図内の総滞在時間をユーザーへ入力させない。
- サークルごとの締切を持たない。
- 原則として全pendingサークルを順路へ含める。
- 後方のサークルも期待価値が小さくなるだけで、強制的に切り捨てない。
- 各地図は引き続き独立して最適化し、地図間移動と全地図一括最適化は実装しない。
- 現在案内中の最初の区間は固定し、その後ろだけを改善する。

## 2. Objective

候補サークル`i`の価値を`value[i]`、購入完了時刻を`completionTimeSec[i]`とする。

```text
completionTimeSec[next]
  = completionTimeSec[current]
  + travelTimeSec[current, next]
  + serviceTimeSec[next]
```

減衰係数は半減時間30分、60分、120分の等重み平均とする。

```text
decay(t)
  = (
      2^(-t / 1800)
      + 2^(-t / 3600)
      + 2^(-t / 7200)
    ) / 3

score(route)
  = sum(value[i] * decay(completionTimeSec[i]))
```

- `value[i]`は既存の`priority`を使用し、`max(0, priority ?? 0)`で正規化する。
- priorityが0または未設定のサークルも順路へ残せるが、scoreには寄与しない。
- scoreは購入完了時刻で評価し、到着時刻では評価しない。
- routeの終点から始点へ戻ることを要求しない。

## 3. Distance-to-time conversion

Task 5の距離行列は、今後も重み付きグリッド距離のまま保存する。物理時間への変換はTask 6のoptimizer adapterで行う。

```text
travelTimeSec = weightedDistance * secondsPerWeightedDistance[areaId]
```

初期timing profileは、非混雑時の歩行速度`0.5 m/s`を前提とする。

```ts
const SECONDS_PER_WEIGHTED_DISTANCE = {
  e456: 0.13184,
  e7: 0.11288,
  s12: 0.15066,
  w12: 0.12425,
} as const;
```

- 上記は初期推定値であり、実測またはより正確な図面で後から更新できる。
- timing profileにはversionを持たせる。
- timing profileの変更でdistance matrixを再生成しない。
- timing profileが変わった場合、古いbest orderやwarm-start summaryは同一profileの結果として扱わない。
- crowded multiplier `1.5`はTask 5のweighted distanceへ既に含まれているため、Task 6で二重に掛けない。

## 4. Service time

optimizer kernelは各ノードの`serviceTimesSec`を入力として受け取る。

- 通常サークル: 30秒
- 壁サークル: 200秒

壁分類は経路の通行可否とは別のmetadataである。blocked/crowded gridによる外壁・机・サークル貫通防止はTask 5の責務とする。

- Task 6は任意の`serviceTimesSec`配列を正しく評価できることを保証する。
- Task 7で実データからservice timeを解決する。
- 信頼できる壁分類が得られないサークルは30秒をdefaultとする。
- 将来`queueClass`等の入力metadataを追加してもALNS kernelを変更しない。

## 5. Solver selection

production solverはALNSのみとする。GAはproductionへ実装しない。

選定根拠はE7通路gridを使った軽量比較である。

- N=50、100
- 10 seeds
- valueは3、4、5
- 始点はランダム
- search timeは5、10、15秒
- N=50では30/30条件でALNSがGAを上回った。
- N=100では大部分が同点で、GAの平均優位は最大でも約0.02%未満だった。

この比較は候補点と壁分類に近似を含むため、正式な性能保証ではない。Phase 5Cで一種類のsolverを選ぶための軽量なdecision recordとして使用する。

## 6. Worker contract

- optimizerはWeb Worker内で動かす。
- search time settingは5秒、10秒、15秒とし、defaultは10秒とする。
- cancel時は最新bestを返す。
- progressは経過時間、設定時間、最新bestを返す。
- deterministic random seedを受け取る。
- previous bestと修復済みrouteをwarm startとして受け取る。
- fixed first targetを変更しない。
- Worker resultだけでcurrent targetまたはcurrent legを変更しない。
- 実行ごとの確認dialogを追加しない。

Worker job stageのoptimizer名は`time-decayed-alns`とする。旧`top-tw`表記は使用しない。

## 7. Testing boundary

Python版TOPTWとのscore一致、Python runtime、Python package、Python参照実装をPhase 5Cのentry gateおよびacceptance criteriaから削除する。

Task 6ではTypeScriptの小規模fictional fixtureを用いて、次を検証する。

- 距離から時間への変換
- service timeを含むcompletion time
- 3つの半減時間の等重みscore
- fixed first target
- deterministic seed
- warm start
- progress
- cancel時のlatest best
- 5/10/15秒以外の拒否

## 8. Recovery and cache identity

navigation recovery snapshotとoptimization summaryには`optimizationProfileVersion`を保存する。

profile versionには少なくとも次を反映する。

- area別distance-to-time係数
- 半減時間と重み
- service-time policy
- objective schema version

profileが一致しない場合もdistance matrixは再利用できるが、best orderとwarm startは再評価または修復してから使用する。
