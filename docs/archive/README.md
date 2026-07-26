# Archive Policy

このディレクトリは、完了済みPhaseの設計、計画、Task、レビュー、補足記録を保管する。

## 移動対象

- Phase 1の完了済み文書 → `docs/archive/phase-01/`
- Phase 2の完了済み文書 → `docs/archive/phase-02/`
- Phase 3の完了済み文書 → `docs/archive/phase-03/`
- Phase 4の完了済み文書 → `docs/archive/phase-04/`
- Phase 5Aの完了済み文書 → `docs/archive/phase-05a/`

## 移動規則

- ファイル内容を変更せず移動する。
- 完了チェック、commit ID、古い前提、誤記も修正しない。
- 元のファイル名は、同名衝突がない限り維持する。
- 同名衝突がある場合だけ、Phase番号または元ディレクトリ名を接頭辞に付ける。
- 現在も有効なarchitecture契約はarchiveへ移さず`docs/architecture/`に残す。
- 現在の実装やTaskを判断するためにarchiveを使わない。
- 現行文書からarchiveへリンクする場合は「履歴参照」であることを明記する。

## 禁止事項

- 過去文書を現在仕様に合わせて書き直さない。
- 過去文書の未完了チェックを、現在の実装から推測して変更しない。
- archive内の記述を、現行Taskの曖昧な箇所を補う根拠にしない。
