# Phase 8 Task 1 implementation review

## Review target

- branch: `docs/phase-08-task-01-generic-event-map-contract-plan`
- reviewed implementation head: `9b507159c4e1c1e056943115b022d1c76febeed5`
- implementation start: `76fa5ae7424bbe50693662baeeebcc20656f8996`
- Task 0 last code baseline: `c1606fa6222283bce023120790dff975bcf92c11`

## Verdict

Task 1.1〜1.3の実装方針は概ね正しいが、Task 1はまだ完了扱いにしない。

blocking itemは次の2件。

1. `mapBundleContract`がboundary型には追加された一方、`SwitchEventDayUseCase`が使用するdomain側`EventRegistryEntry`へ伝播していない。
2. `npm run test:e2e:ci`の4 failureを「開始commitでも再現した既存failure」とだけ分類することはできない。Task 0では同じproduction/test code系列が72 passed / 8 skipped / 0 failedだったため、flaky / environment / full-suite order dependency / Task 1 regressionのいずれかを切り分ける必要がある。

## Finding 1: domain registry contract must carry mapBundleContract

Current boundary type:

- `apps/webapp/js/features/event-day/domain/application-contract-types.ts`
  - `EventRegistryEntryV1.mapBundleContract?: "event" | "legacy"`

Current domain type:

- `apps/webapp/js/features/event-day/domain/event-day-contracts.ts`
  - `EventRegistryEntry`には`mapBundleContract`がない。

`SwitchEventDayUseCase`はdomain `EventRegistryEntry`を`loadManifest(event)`へ渡す。現在はparsed registry objectのextra propertyがruntime objectに残るためlegacy demoが動くが、型契約上はdiscriminatorが途中で失われている。

これは将来event objectを再構築した場合、TypeScriptが`mapBundleContract`のdropを検出できない構造である。

### Required correction

`EventRegistryEntry`にも次を追加する。

```ts
readonly mapBundleContract?: "event" | "legacy";
```

これはTask 5の広範囲contract統合ではなく、Task 1で導入したdiscriminatorを既存domain boundaryへ通すための最小修正である。

必要なら`tests/event-day-transition-service.test.ts`または既存同責務testで、legacy discriminator付きeventが`loadManifest`へ保持されたまま渡ることを証明する。

## Finding 2: production default-strict test should use the real registry entry

`tests/event-registry.test.ts`のC108 runtime loader testはproduction registryから`c108Event`を取得しているが、loaderへ渡す引数を手書きの

```ts
{ eventId: "C108", displayName: "C108" }
```

に置き換えている。

これでは「production C108 registryには`mapBundleContract`を追加せず、missingがstrictとして扱われる」というTask 1 acceptanceを直接証明していない。

### Required correction

同testではparsed production registryの`c108Event`自体を`loadRuntimeMapBundleManifestFromUrl()`へ渡す。

併せて、production registry entryの`mapBundleContract`が`undefined`であることをassertしてもよい。

production registry JSON自体へfieldを追加してはいけない。

## E2E blocker diagnosis

### Important baseline fact

`c1606fa`からTask 1開始commit`76fa5ae`までproduction code / E2E codeの変更はなく、docsだけが変更されている。

Task 0 final verificationでは同code系列で:

- `npm run test:e2e:ci`: PASS
- 72 passed / 8 skipped / 0 failed

Task 1実装時にはstart`76fa5ae`でもmanagement Flow 2/3/7/9が再現したと報告されている。

したがって、単純な`PRE_EXISTING_FAILURE`ではなく、最低でも次を判別する。

- `TASK1_REGRESSION`
- `FLAKY_BASELINE`
- `FULL_SUITE_ORDER_OR_SHARED_STATE`
- `ENVIRONMENT_DEPENDENT`
- `UNKNOWN`

### Required reproduction matrix

同じclean CI containerを使い、baselineとheadを別worktreeで比較する。

Baseline:

```text
76fa5ae7424bbe50693662baeeebcc20656f8996
```

Head:

```text
9b507159c4e1c1e056943115b022d1c76febeed5
```

最低限それぞれで次を実行し、各runのexact failing test name / assertion / retry resultを保存する。

```bash
bash scripts/run-e2e-in-ci-container.sh tests/e2e/management.spec.ts --project=mobile-chromium
```

これを各revisionで3回。

その後、各revisionで少なくとも1回:

```bash
npm run test:e2e:ci
```

focused managementはgreenだがfull suiteだけfailureする場合は、同revisionで診断として次も実行する。

```bash
bash scripts/run-e2e-in-ci-container.sh tests/e2e/management.spec.ts --project=mobile-chromium --workers=1
```

必要ならfull suiteの`--workers=1`も診断目的で実行する。ただし通常gateをsingle-workerへ置き換えて完了扱いにはしない。

### Fix rules

- headだけで再現するならTask 1 regressionとしてTask 1 code / fixture contractを修正する。
- baseline/head両方でintermittentなら、root causeを特定してから最小のtest stabilizationまたは本当のproduct race fixを行う。
- full suiteだけで再現するならtest isolation / shared state / orderingを調査する。
- visual snapshot更新で逃げない。
- timeout延長、retry増加、`waitForTimeout()`追加だけで症状を隠さない。
- unrelated management production refactorをしない。
- root causeが不明なままTask 1を完了扱いにしない。

## Accepted Task 1 implementation evidence so far

- `EventMapAreaManifest`へ`prefixes` / `labels`を追加。
- strict areas countをexactly 4からnon-emptyへgeneric化。
- C108 metadataをmanifestへ移動し、`bundleVersion: c108-v1`維持。
- registryにexplicit optional `mapBundleContract`を追加しunknown valueをreject。
- production loaderから`C108_AREA_METADATA`と`eventId === "C108"`分岐を削除。
- missing / `event`はstrict、`legacy`だけlegacy loader。
- malformed strict payloadからlegacyへのfallbackなし。
- non-C108 C999 one-area strict runtime test追加。
- strict registry/bundle eventId mismatch拒否。
- current implementation diffはTask 1 scopeの10 filesのみ。
- production C108 registry、demo-v1 manifest、wrapper、visual snapshotは未変更。

## Completion gate

Task 1完了は次をすべて満たした時だけ。

1. Finding 1 / 2を修正。
2. E2E 4 failureのroot cause classificationを証拠付きで確定。
3. 必要な最小fixを適用。
4. focused tests green。
5. `npm run verify` exit 0。
6. 通常の`npm run test:e2e:ci` exit 0。
7. hardcode / scope audit green。
8. `docs/status/progress.md`を実測値でTask 1完了へ更新。
9. docs commitを作成してbranchへpush。

Task 2へはまだ進まない。
