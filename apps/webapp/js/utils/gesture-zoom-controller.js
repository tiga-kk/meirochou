/**
 * 高度な画像ズーム（ピンチズーム、パン、慣性、バウンド、PCマウス・ホイール対応）を設定するクラス
 */
export class GestureZoomController {
  constructor(container, img) {
    this.container = container;
    this.img = img;

    this.state = {
      scale: 1,
      x: 0,
      y: 0,
    };

    // 設定値
    this.MIN_SCALE = 1;
    this.MAX_SCALE = 5;
    this.FRICTION = 0.92; // 慣性の減衰率
    this.BOUNCE_FRICTION = 0.8; // バウンド時の減衰率

    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.vx = 0;
    this.vy = 0; // 速度
    this.rafId = null;

    // ピンチ用
    this.initialDistance = 0;
    this.initialScale = 1;
    this.pinchCenter = { x: 0, y: 0 };

    this.init();
  }

  init() {
    this.container.style.overflow = "hidden";
    this.container.style.touchAction = "none";
    this.img.style.transformOrigin = "0 0"; // 左上基準で計算する
    this.updateTransform();

    // 外部からのリセット用に関数を追加
    this.img.resetZoom = () => this.reset();

    // タッチイベント登録
    this.container.addEventListener(
      "touchstart",
      (e) => this.handleTouchStart(e),
      { passive: false },
    );
    this.container.addEventListener(
      "touchmove",
      (e) => this.handleTouchMove(e),
      { passive: false },
    );
    this.container.addEventListener("touchend", (e) => this.handleTouchEnd(e));

    // マウス・ホイールイベント登録（PCサポート）
    this.container.addEventListener("mousedown", (e) =>
      this.handleMouseDown(e),
    );
    this.container.addEventListener("wheel", (e) => this.handleWheel(e), {
      passive: false,
    });
  }

  updateTransform() {
    this.img.style.transform = `translate3d(${this.state.x}px, ${this.state.y}px, 0) scale(${this.state.scale})`;
  }

  reset() {
    this.state = { scale: 1, x: 0, y: 0 };
    this.vx = 0;
    this.vy = 0;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.updateTransform();
  }

  setTransform(transform) {
    if (!transform) return;

    const scale = Number.isFinite(transform.scale)
      ? Math.max(this.MIN_SCALE, Math.min(transform.scale, this.MAX_SCALE))
      : this.state.scale;
    const x = Number.isFinite(transform.x) ? transform.x : this.state.x;
    const y = Number.isFinite(transform.y) ? transform.y : this.state.y;

    this.state = { scale, x, y };
    this.vx = 0;
    this.vy = 0;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.updateTransform();
  }

  setMaxScale(maxScale) {
    if (!Number.isFinite(maxScale) || maxScale < this.MIN_SCALE) return;

    this.MAX_SCALE = maxScale;
    if (this.state.scale > this.MAX_SCALE) {
      this.state.scale = this.MAX_SCALE;
      this.updateTransform();
    }
  }

  animate() {
    if (this.isDragging) return;

    // 減衰
    this.vx *= this.FRICTION;
    this.vy *= this.FRICTION;

    this.state.x += this.vx;
    this.state.y += this.vy;

    // 境界チェック (Bouncing)
    const containerRect = this.container.getBoundingClientRect();
    const imgRect = this.img.getBoundingClientRect();
    const curW = imgRect.width;
    const curH = imgRect.height;
    const winW = containerRect.width;
    const winH = containerRect.height;

    let bounced = false;

    // X軸の境界
    if (winW >= curW) {
      if (this.state.x > 0) {
        this.state.x += (0 - this.state.x) * 0.2;
        this.vx *= this.BOUNCE_FRICTION;
        bounced = true;
      }
    } else {
      if (this.state.x > 0) {
        this.state.x += (0 - this.state.x) * 0.2;
        this.vx *= this.BOUNCE_FRICTION;
        bounced = true;
      } else if (this.state.x < winW - curW) {
        this.state.x += (winW - curW - this.state.x) * 0.2;
        this.vx *= this.BOUNCE_FRICTION;
        bounced = true;
      }
    }

    // Y軸の境界
    if (winH >= curH) {
      if (this.state.y > 0) {
        this.state.y += (0 - this.state.y) * 0.2;
        this.vy *= this.BOUNCE_FRICTION;
        bounced = true;
      }
    } else {
      if (this.state.y > 0) {
        this.state.y += (0 - this.state.y) * 0.2;
        this.vy *= this.BOUNCE_FRICTION;
        bounced = true;
      } else if (this.state.y < winH - curH) {
        this.state.y += (winH - curH - this.state.y) * 0.2;
        this.vy *= this.BOUNCE_FRICTION;
        bounced = true;
      }
    }

    if (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1 || bounced) {
      this.updateTransform();
      this.rafId = requestAnimationFrame(() => this.animate());
    }
  }

  handleTouchStart(e) {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.isDragging = true;

    if (e.touches.length === 1) {
      this.startX = e.touches[0].clientX;
      this.startY = e.touches[0].clientY;
      this.lastX = this.startX;
      this.lastY = this.startY;
      this.vx = 0;
      this.vy = 0;
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      this.initialDistance = Math.hypot(
        t2.clientX - t1.clientX,
        t2.clientY - t1.clientY,
      );
      this.initialScale = this.state.scale;
      this.pinchCenter = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      this.lastX = this.pinchCenter.x;
      this.lastY = this.pinchCenter.y;
    }
  }

  handleTouchMove(e) {
    if (e.cancelable) e.preventDefault();

    if (e.touches.length === 1) {
      const cx = e.touches[0].clientX;
      const cy = e.touches[0].clientY;
      const dx = cx - this.lastX;
      const dy = cy - this.lastY;

      this.state.x += dx;
      this.state.y += dy;
      this.vx = dx;
      this.vy = dy;

      this.lastX = cx;
      this.lastY = cy;
      this.updateTransform();
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(
        t2.clientX - t1.clientX,
        t2.clientY - t1.clientY,
      );
      const currentCenter = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };

      const dx = currentCenter.x - this.lastX;
      const dy = currentCenter.y - this.lastY;
      this.state.x += dx;
      this.state.y += dy;
      this.lastX = currentCenter.x;
      this.lastY = currentCenter.y;

      if (this.initialDistance > 0) {
        const newScale =
          this.initialScale * (currentDist / this.initialDistance);
        const containerRect = this.container.getBoundingClientRect();
        const relX = currentCenter.x - containerRect.left;
        const relY = currentCenter.y - containerRect.top;
        const imgX = relX - this.state.x;
        const imgY = relY - this.state.y;
        const scaleRatio = newScale / this.state.scale;

        this.state.x -= imgX * (scaleRatio - 1);
        this.state.y -= imgY * (scaleRatio - 1);
        this.state.scale = Math.max(
          this.MIN_SCALE,
          Math.min(newScale, this.MAX_SCALE),
        );
      }
      this.updateTransform();
    }
  }

  handleTouchEnd(e) {
    if (e.touches.length === 0) {
      this.isDragging = false;
      this.rafId = requestAnimationFrame(() => this.animate());
      if (this.state.scale < this.MIN_SCALE) {
        this.state.scale = this.MIN_SCALE;
      }
    } else if (e.touches.length === 1) {
      this.lastX = e.touches[0].clientX;
      this.lastY = e.touches[0].clientY;
    }
  }

  // PC (Mouse) パン処理
  handleMouseDown(e) {
    if (e.button !== 0) return; // 左クリックのみ
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.isDragging = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.lastX = this.startX;
    this.lastY = this.startY;
    this.vx = 0;
    this.vy = 0;

    const handleMouseMove = (moveEvent) => {
      if (!this.isDragging) return;
      const dx = moveEvent.clientX - this.lastX;
      const dy = moveEvent.clientY - this.lastY;
      this.state.x += dx;
      this.state.y += dy;
      this.vx = dx;
      this.vy = dy;
      this.lastX = moveEvent.clientX;
      this.lastY = moveEvent.clientY;
      this.updateTransform();
    };

    const handleMouseUp = () => {
      this.isDragging = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      this.rafId = requestAnimationFrame(() => this.animate());
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  // PC (Wheel) ズーム処理
  handleWheel(e) {
    e.preventDefault();
    if (this.rafId) cancelAnimationFrame(this.rafId);

    const zoomIntensity = 0.1;
    const delta = e.deltaY < 0 ? 1 : -1;
    const newScale = Math.max(
      this.MIN_SCALE,
      Math.min(this.state.scale + delta * zoomIntensity, this.MAX_SCALE),
    );

    const containerRect = this.container.getBoundingClientRect();
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;

    const imgX = mouseX - this.state.x;
    const imgY = mouseY - this.state.y;
    const scaleRatio = newScale / this.state.scale;

    this.state.x -= imgX * (scaleRatio - 1);
    this.state.y -= imgY * (scaleRatio - 1);
    this.state.scale = newScale;

    this.updateTransform();
    this.rafId = requestAnimationFrame(() => this.animate());
  }
}

/**
 * ギャラリー地図のリサイズ機能を設定
 */
export function setupResizableMap(container, header) {
  let startY = 0;
  let startHeight = 0;
  let isResizing = false;

  const onStart = (clientY) => {
    isResizing = true;
    startY = clientY;
    startHeight = container.getBoundingClientRect().height;
    container.classList.add("resizing");
  };

  const onMove = (clientY) => {
    if (!isResizing) return;
    const deltaY = startY - clientY;
    const newHeight = startHeight + deltaY;
    container.style.height = `${newHeight}px`;
  };

  const onEnd = () => {
    if (isResizing) {
      isResizing = false;
      container.classList.remove("resizing");
    }
  };

  header.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        onStart(e.touches[0].clientY);
      }
    },
    { passive: false },
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      if (isResizing && e.touches.length === 1) {
        onMove(e.touches[0].clientY);
      }
    },
    { passive: false },
  );

  document.addEventListener("touchend", onEnd);

  header.addEventListener("mousedown", (e) => {
    e.preventDefault();
    onStart(e.clientY);
  });

  document.addEventListener("mousemove", (e) => {
    if (isResizing) {
      e.preventDefault();
      onMove(e.clientY);
    }
  });

  document.addEventListener("mouseup", onEnd);
}

/**
 * スワイプアクションを設定
 */
export function setupSwipeAction(element, callback) {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let isSwiping = false;
  const threshold = 100; // アクション発火閾値

  element.addEventListener(
    "touchstart",
    (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      currentX = 0;
      isSwiping = false;
      element.style.transition = "none";
    },
    { passive: true },
  );

  element.addEventListener(
    "touchmove",
    (e) => {
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const deltaX = x - startX;
      const deltaY = y - startY;

      if (!isSwiping && Math.abs(deltaY) > Math.abs(deltaX)) {
        return;
      }

      if (!isSwiping && Math.abs(deltaX) > 10) {
        isSwiping = true;
      }

      if (isSwiping) {
        if (e.cancelable) e.preventDefault();
        currentX = deltaX;
        element.style.transform = `translateX(${deltaX}px)`;

        if (Math.abs(deltaX) > threshold) {
          element.style.opacity = "0.6";
        } else {
          element.style.opacity = "1";
        }
      }
    },
    { passive: false },
  );

  element.addEventListener("touchend", () => {
    element.style.transition = "transform 0.3s ease-out, opacity 0.3s";
    element.style.opacity = "1";

    if (isSwiping) {
      if (Math.abs(currentX) > threshold) {
        const direction = currentX > 0 ? 1 : -1;
        element.style.transform = `translateX(${direction * 100}%)`;
        setTimeout(() => {
          callback();
          setTimeout(() => {
            if (element.parentNode) element.style.transform = "";
          }, 500);
        }, 50);
      } else {
        element.style.transform = "";
      }
    }
    isSwiping = false;
  });
}
