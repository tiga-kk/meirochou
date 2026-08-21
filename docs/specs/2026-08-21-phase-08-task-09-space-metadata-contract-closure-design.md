# Phase 8 Task 9: Space Metadata Contract Closure Design

## Goal

Phase 8で導入したgeneric strict event map contractと`meirochou_wrapper build-event`が、実際のwebapp runtime space grammarでは解釈できない`prefixes` / `labels`や曖昧なarea ownershipを正常データとして受理しないようにする。

このTaskはruntimeを可変長prefixや新しいlabel文字種へ一般化するTaskではない。現在productionで使っているspace grammarを正本として、strict manifestとwrapper generatorをそのgrammarへ狭める最終closure fixである。

## Background

Phase 8 Task 1ではC108固有のarea metadataをproduction TypeScriptからstrict event map manifestへ移し、任意eventをregistry + map bundle dataだけで追加できる構造へ変更した。

現在のstrict manifestは各areaについて次を要求する。

```text
areaId
metersPerPixel
prefixes: non-empty unique strings
labels: non-empty unique strings
assets
```

しかしruntime側のspace解釈はより狭い。

`apps/webapp/js/shared/domain/space-parser.ts`では通常spaceを概ね次のgrammarで解釈する。

```text
prefix: 1文字
label: ASCII英字 / ひらがな / カタカナの1文字
number: 1桁以上の数字
side: optional ASCII letters 1〜2文字
```

入力spaceは先にNFKC normalizeされる。

また、area lookupは次の既存実装でprefixとlabelを先頭2文字から取得する。

```text
apps/webapp/js/features/route-guidance/infrastructure/in-memory-map-area-catalog.ts
apps/webapp/js/app/browser-application.ts
```

実質的には次である。

```ts
const prefix = cleaned[0];
const label = cleaned[1];
```

したがって現在のstrict contractが例えば次を受理すると、manifest自体はvalidでもruntimeでは正しくareaを解決できない。

```json
{
  "prefixes": ["東館"],
  "labels": ["1"]
}
```

同様に、入力spaceはNFKC normalizeされる一方でmanifest metadata側はruntime lookup前にNFKC normalizeされないため、compatibility characterをmetadataへ許すと比較がずれる。

さらに現在のarea lookupは最初に一致したareaを返す。二つのareaが同じ`prefix × label`組を宣言した場合、manifest validationは通るがarea ownershipは曖昧になる。

例:

```text
area-a prefixes=["東"], labels=["A", "B"]
area-b prefixes=["東"], labels=["B", "C"]
```

`東B...`は両areaに一致し、runtimeはmanifest順で先のareaを選んでしまう。

## Root cause

Phase 8 Task 1のstrict manifest contractは、metadataの「存在・空でない・重複しない」ことまでは検証したが、metadataがruntime space grammarと一致することをcontractとして固定していなかった。

Phase 8 Task 3のwrapper generatorもproduction strict parserへshapeを合わせたが、同様にruntime grammarまではmirroringしていない。

Task 4のdata-only C999 proofは有効な1文字prefix / ASCII labelしか使用していないため、この不整合を検出できなかった。

## Chosen approach

### 1. Runtime grammarを広げず、strict production data contractを狭める

このTaskでは`parseSpace()`、`canonicalizeSpace()`、`findMapAreaForCircleSpace()`、`BrowserApplication`のspace lookup semanticsを変更しない。

理由:

- 現在のC108 production dataは既存grammar内に収まっている。
- Phase 8の目的はevent固有codeを増やさずdata-only追加を可能にすることであり、可変長prefix対応は別機能である。
- runtime generalizationを同時に行うとrouting、current-location、nearby、gallery等へ影響範囲が広がる。
- 今回必要なのはgenerator / validatorがruntimeで使えないdataを成功扱いしないことだけである。

### 2. `space-parser.ts`をwebapp側grammarのsingle sourceにする

`apps/webapp/js/shared/domain/space-parser.ts`へ小さいpredicateを二つ追加する。

```ts
export function isRuntimeSpacePrefixCharacter(value: unknown): value is string
export function isRuntimeSpaceLabelCharacter(value: unknown): value is string
```

意味を次で固定する。

#### Prefix character

- stringである。
- surrounding whitespaceを除いた後の値を対象とする。
- JavaScript `string.length === 1`、つまり現在の`cleaned[0]` lookupで1 unitとして扱えるBMP 1文字である。
- whitespace文字ではない。
- `value.normalize("NFKC") === value`である。

これにより少なくとも次を受理する。

```text
東
西
南
A
```

次をrejectする。

```text
東館
""
" "
Ａ
①
😀
```

`😀`をrejectする理由は、現在のarea lookupが`cleaned[0]`を使うためUTF-16 surrogate pairを1文字として扱えないからである。

#### Label character

- stringである。
- NFKC-stableである。
- 現行`spaceLabel` grammarの1文字に一致する。

正規表現sourceは既存と同じ次である。

```text
[A-Za-z\u3041-\u3096\u30A1-\u30FA]
```

受理例:

```text
A
z
あ
ん
ア
ン
```

reject例:

```text
1
東
AB
" "
Ａ
😀
```

label predicateは既存`spaceLabel` sourceから構築し、同一TypeScript file内で文字種定義を二重に持たない。

### 3. Strict event map parserだけを新grammarへ合わせる

対象:

```text
apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts
```

legacy `parseMapBundleManifest()`は今回変更しない。Task 9の対象はproduction strict event contractであり、demo-v1 legacy migrationはnon-goalである。

`parseEventMapBundleManifest()`では、既存`uniqueTextArray()`でtrim / empty / duplicate validationを行った後、次を追加する。

```text
prefixesの各値 -> isRuntimeSpacePrefixCharacter
labelsの各値   -> isRuntimeSpaceLabelCharacter
```

invalid itemはindexを含むfield pathで`BoundaryValidationError`にする。

例:

```text
map bundle manifest.areas[0].prefixes[0]
map bundle manifest.areas[0].labels[1]
```

### 4. Area ownershipを`prefix × label`単位で一意にする

strict manifest内の全areaについて、各areaが所有するspace metadata keyをCartesian productとして扱う。

```text
for prefix in area.prefixes
  for label in area.labels
    ownership key = [prefix, label]
```

同じkeyを別areaが既に所有していればmanifestをrejectする。

許可:

```text
area-a prefixes=["東"], labels=["A", "B"]
area-b prefixes=["東"], labels=["C", "D"]
```

許可:

```text
area-a prefixes=["東"], labels=["A"]
area-b prefixes=["西"], labels=["A"]
```

拒否:

```text
area-a prefixes=["東"], labels=["A", "B"]
area-b prefixes=["東"], labels=["B", "C"]
```

errorは後から現れたareaを指し、競合した`prefix + label`と先行owner `areaId`をmessageに含める。

このTaskではruntime lookup orderを変更しない。曖昧dataを境界で拒否する。

### 5. Wrapper generatorは同じcontractをmirroringする

対象repository:

```text
tiga-kk/meirochou_wrapper
```

対象module:

```text
python/pathdata/comiket_pathdata/event_build.py
```

wrapperはTypeScript moduleをimportできないため、contractを小さなPython validationとして明示的にmirrorする。

追加する意味上のrule:

```text
prefix:
- normalized string
- exactly one UTF-16 code unit
- NFKC-stable
- non-whitespace

label:
- exactly one runtime-supported label character
- NFKC-stable
- regex ^[A-Za-z\u3041-\u3096\u30A1-\u30FA]$

area ownership:
- every (prefix, label) pair belongs to at most one area
```

Pythonの`len(str)`はUnicode code point countなので、prefixについて単に`len(value) == 1`だけを使わない。JavaScript `string.length === 1`と一致させるためUTF-16 LE encoded byte lengthが2 bytesであることを確認する。

例となるsmall helper:

```python
def _is_single_runtime_utf16_unit(value: str) -> bool:
    try:
        return (
            len(value.encode("utf-16-le")) == 2
            and unicodedata.normalize("NFKC", value) == value
        )
    except UnicodeEncodeError:
        return False
```

wrapperの既存`_unique_strings()`によるtrim / duplicate handlingは維持する。

`allowed_symbols`からderivedされるlabelsも同じruntime label predicateを通す。

### 6. Cross-repo ownership

contract ownerを次のように整理する。

```text
meirochou
  runtime grammar semantics
  strict production manifest validation
  production operator guide

meirochou_wrapper
  generated staging packageが上記contractを満たすことのpreflight validation
```

schema package、shared generated schema、code generation、submodule、npm/Python共通packageは追加しない。

Phase 8 closure fixとしてはcontractが小さく安定しており、同じnegative fixtureを両repoに明示する方が低コストである。

### 7. Operator documentation

`guides/event-addition.md`のstaging reviewへ次を追記する。

- prefixは現在のruntimeで1文字として解釈できるNFKC-stable BMP文字である。
- multi-character prefix（例: `東館`）は不可。
- labelはcurrent runtime grammarのASCII letter / hiragana / katakana 1文字である。
- numeric label、kanji label、full-width compatibility labelは不可。
- 別area間で同じ`prefix × label`を所有しない。
- 将来このgrammarを拡張したい場合、generated dataを手修正せずruntime contract変更Taskとして扱う。

wrapper `python/pathdata/README.md`にもevent TOML `prefixes`とderived labelsの同じ制約を短く記載する。

## Test strategy

### meirochou unit contract

`tests/space-parser.test.ts`でpredicateのgrammarそのものを固定する。

最低限:

```text
prefix accepts: 東, 西, A
prefix rejects: 東館, whitespace, Ａ, ①, 😀
label accepts: A, z, あ, ん, ア, ン
label rejects: 1, 東, AB, whitespace, Ａ, 😀
```

`tests/boundary-parsers.test.ts`でstrict parser behaviorを固定する。

最低限:

```text
valid 1-char metadata remains accepted
multi-character prefix rejected
compatibility/full-width prefix rejected
numeric label rejected
kanji label rejected
ambiguous prefix×label ownership across areas rejected
same prefix + disjoint labels accepted
same label + disjoint prefixes accepted
```

既存C108 4-area manifest testとTask 4 C999 data-only testを変更せず再実行し、valid production-shaped dataが壊れていないことを確認する。

### wrapper contract

`python/pathdata/tests/test_event_build.py`で同じnegative / positive matrixを持つ。

最低限:

```text
prefix accepts: 東
prefix rejects: 東館, whitespace-only, Ａ, ①, 😀
allowed_symbols accepts: A, あ, ア
allowed_symbols rejects: 1, 東, whitespace, Ａ, 😀
ambiguous cross-area prefix×label ownership rejects before publication
same prefix + disjoint labels remains valid
```

既存deterministic build、review gate、atomic publication、area_id contract testは維持する。

### Full verification

meirochou:

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

Task 9はrouting/UI behaviorを変えないため新しいbrowser interaction E2Eは追加しない。既存E2E full suiteでregressionを確認する。

wrapper:

```bash
cd python/pathdata
.venv/bin/python -m unittest tests.test_event_build -v
.venv/bin/python -m unittest discover -s tests
.venv/bin/ruff check .
.venv/bin/python -m pyright
```

repository rootで:

```bash
git diff --check
```

## Repository / branch execution model

Plan documentは`meirochou`をcanonical ownerとして保持する。

Planning時点:

```text
meirochou/main: 75adaebd9b571d24aaee09d443dec17513baf10d
meirochou_wrapper/main: aa864f1ba80b87b63760248edc60b39a85d18d58
```

これらは観測baselineであり、実装開始時にhard resetするSHAではない。

実装開始時は必ず両repositoryで`git fetch origin`し、対象remote branchの最新HEADから`TASK_START_SHA`を取得する。

`meirochou`はplanning branch上で実装を継続する。

```text
docs/phase-08-task-09-space-metadata-contract-closure-plan
```

`meirochou_wrapper`は最新`origin/main`から次のdedicated branchを作る。

```text
feature/phase-08-task-09-space-metadata-contract-closure
```

既に同名remote branchが存在する場合はその最新HEADを確認し、意図したTask 9 branchである場合だけ継続する。

## Expected production diff

### meirochou

```text
M apps/webapp/js/shared/domain/space-parser.ts
M apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts
M tests/space-parser.test.ts
M tests/boundary-parsers.test.ts
M guides/event-addition.md
M docs/status/progress.md   # final verification record only
```

Planning docs/review filesはこの一覧とは別に既に存在する。

原則として次は変更しない。

```text
apps/webapp/js/app/browser-application.ts
apps/webapp/js/features/route-guidance/**
apps/webapp/events/**
apps/webapp/map-bundles/**
tests/fixtures/phase-08-data-only-event/**
package.json
package-lock.json
vite.config.ts
.github/workflows/**
integrations/**
functions/**
```

### meirochou_wrapper

```text
M python/pathdata/comiket_pathdata/event_build.py
M python/pathdata/tests/test_event_build.py
M python/pathdata/README.md
```

原則として次は変更しない。

```text
python/ocr/**
python/pathdata/comiket_pathdata/svg_render.py
python/pathdata/comiket_pathdata/web_export.py
python/pathdata/comiket_pathdata/grid.py
python/pathdata/tests/test_svg_render.py
.github/workflows/**
```

## Commit strategy

meirochou:

```text
test(phase-08): expose runtime space metadata contract
fix(phase-08): validate strict space metadata

docs(phase-08): document strict space metadata

docs(phase-08): record task 9 verification
```

Small implementationであるため、最初のtest commitとfix commitを分けることを優先する。docsはverificationと混ぜない。

meirochou_wrapper:

```text
test(pathdata): expose runtime space metadata contract
fix(pathdata): align event space metadata validation

docs(pathdata): document event space metadata
```

## Error handling

- invalid manifestはstartup後に曖昧fallbackせずboundary validationでfailする。
- wrapper invalid configはartifact publication前に`EventBuildError`でfailする。
- ambiguous ownershipをmanifest orderで解決しない。
- invalid metadataをtrim / normalizeして別の意味へ自動変換しない。ただし既存`_unique_strings` / `uniqueTextArray`のsurrounding whitespace trim semanticsは維持する。
- current production C108 dataを変換・rewriteしない。

## Non-goals

- 可変長prefix support
- numeric label support
- kanji label support
- emoji / astral Unicode prefix support
- runtime area matching algorithmのrewrite
- `BrowserApplication`のspace lookup refactor
- legacy demo manifest contractのmigration
- schemaVersion bump
- JSON Schema導入
- shared cross-language schema generator
- wrapperからmeirochou repositoryを直接編集/deployする機能
- C109等real event追加
- C108 map data変更
- routing / ALNS / Dijkstra / nearby / gallery behavior変更
- CI workflow / branch protection変更

## Acceptance criteria

Task 9は次をすべて満たした場合だけimplementation completeとする。

1. webapp strict manifestがruntimeで1文字として扱えないprefixをrejectする。
2. webapp strict manifestがcurrent label grammar外のlabelをrejectする。
3. webapp strict manifestがNFKC comparison mismatchを生むmetadataをrejectする。
4. webapp strict manifestがcross-areaで重複する`prefix × label` ownershipをrejectする。
5. same prefix + disjoint labelsは引き続きvalidである。
6. same label + disjoint prefixesは引き続きvalidである。
7. C108 strict manifest regressionがPASSする。
8. Task 4 C999 data-only proofがPASSする。
9. wrapperがwebappと同じprefix / label negative casesをpublication前にrejectする。
10. wrapperがambiguous area ownershipをpublication前にrejectする。
11. wrapper deterministic / atomic publication / review gate testsが引き続きPASSする。
12. operator guideとwrapper READMEが新contractを説明する。
13. meirochou full `npm run verify`がPASSする。
14. meirochou full E2EがPASSする。
15. public-tree audit / architecture / diff checkにregressionがない。
16. wrapper full unittest / Ruff / Pyright / diff checkがPASSする。
17. production C108 event registry / map bundle bytesを変更しない。
18. runtime area matching codeを変更しない。
19. real event追加を行わない。
20. 両repoでTask 9 diffが上記expected scope内に収まる。
21. `docs/status/progress.md`はTask 9を`implementation complete / browser review pending`と記録し、Phase 8をCLOSED/ACCEPTEDにしない。
22. browser-side final reviewが両repositoryのactual diffとverification evidenceを確認するまでPhase 8 closureを宣言しない。

## Closure rule

Task 8までのimplementation evidenceは保持する。Task 9はそれらをやり直すPhaseではなく、Phase 8全体レビューで発見したcontract defectだけを補修する。

Task 9 implementation完了後、browser reviewで両repositoryを再確認する。そのreviewがACCEPTEDの場合のみ、別のdocs-only closure commitでPhase 8を正式CLOSEDにしてよい。
