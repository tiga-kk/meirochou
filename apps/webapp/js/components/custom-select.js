/**
 * カスタムセレクトボックスコンポーネント
 * ネイティブのSELECT要素をラップして、デザイン可能なDIVベースのセレクトボックスを生成する
 */
export class CustomSelect {
  /**
   * @param {HTMLSelectElement} nativeSelect - ラップするネイティブのselect要素
   * @param {Function} onChangeCallback - 値変更時のコールバック
   */
  constructor(nativeSelect, onChangeCallback) {
    this.nativeSelect = nativeSelect;
    this.onChangeCallback = onChangeCallback;
    this.wrapper = null;
    this.trigger = null;
    this.optionsList = null;

    this.init();
  }

  /**
   * 初期化
   */
  init() {
    this.wrapper = document.createElement("div");
    this.wrapper.className = "custom-select-wrapper";
    this.nativeSelect.parentNode.insertBefore(this.wrapper, this.nativeSelect);
    this.wrapper.appendChild(this.nativeSelect);

    this.trigger = document.createElement("div");
    this.trigger.className = "custom-select-trigger";

    // 初期表示
    this.updateTrigger();

    this.trigger.onclick = (e) => {
      e.stopPropagation();
      this.toggle();
    };

    this.wrapper.appendChild(this.trigger);

    this.optionsList = document.createElement("div");
    this.optionsList.className = "custom-options";
    this.wrapper.appendChild(this.optionsList);

    this.renderOptions();

    // 外部クリックで閉じる
    document.addEventListener("click", (e) => {
      if (!this.wrapper.contains(e.target)) {
        this.close();
      }
    });
  }

  /**
   * オプションリストの描画
   */
  renderOptions() {
    this.optionsList.innerHTML = "";
    Array.from(this.nativeSelect.options).forEach((opt) => {
      const optionDiv = document.createElement("div");
      optionDiv.className = `custom-option${opt.selected ? " selected" : ""}`;
      optionDiv.textContent = opt.textContent;
      optionDiv.dataset.value = opt.value;

      optionDiv.onclick = (e) => {
        e.stopPropagation();
        this.select(opt.value, opt.textContent);

        // 選択状態のスタイル更新
        Array.from(this.optionsList.children).forEach((el) => {
          el.classList.remove("selected");
        });
        optionDiv.classList.add("selected");
      };

      this.optionsList.appendChild(optionDiv);
    });
  }

  /**
   * 値を選択
   */
  select(value, text) {
    this.nativeSelect.value = value;
    this.trigger.textContent = text;
    this.close();

    if (this.onChangeCallback) this.onChangeCallback();
  }

  /**
   * 開閉トグル
   */
  toggle() {
    // 他の開いているCustomSelectを閉じる
    document.querySelectorAll(".custom-options.open").forEach((el) => {
      if (el !== this.optionsList) el.classList.remove("open");
    });
    this.optionsList.classList.toggle("open");
  }

  /**
   * 閉じる
   */
  close() {
    this.optionsList.classList.remove("open");
  }

  /**
   * トリガー（表示テキスト）の更新
   */
  updateTrigger() {
    const selected = this.nativeSelect.options[this.nativeSelect.selectedIndex];
    if (selected) {
      this.trigger.textContent = selected.textContent;
    } else {
      this.trigger.textContent = "";
    }
  }

  /**
   * 再描画（オプションが動的に変わった場合などに呼ぶ）
   */
  render() {
    this.renderOptions();
    this.updateTrigger();
  }
}
