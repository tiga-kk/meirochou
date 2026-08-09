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
    this.activePointers = new Map();
    this.vx = 0;
    this.vy = 0;
    this.rafId = null;
    this.transformRafId = null;
    this.resizeObserver = null;
    this.layout = {
      containerWidth: 0,
      containerHeight: 0,
      imageWidth: 0,
      imageHeight: 0,
    };

    this.initialDistance = 0;
    this.initialScale = 1;
    this.lastPinchCenter = { x: 0, y: 0 };

    this.init();
  }

  init() {
    this.container.style.overflow = "hidden";
    this.container.style.touchAction = "none";
    this.img.style.transformOrigin = "0 0";
    this.refreshLayout();
    this.updateTransform();

    this.img.resetZoom = () => this.reset();
    this.img.addEventListener("load", () => this.refreshLayout());
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(() => this.refreshLayout());
      this.resizeObserver.observe(this.container);
    }

    this.container.addEventListener("pointerdown", (e) =>
      this.handlePointerDown(e),
    );
    this.container.addEventListener("pointermove", (e) =>
      this.handlePointerMove(e),
    );
    this.container.addEventListener("pointerup", (e) =>
      this.handlePointerEnd(e),
    );
    this.container.addEventListener("pointercancel", (e) =>
      this.handlePointerEnd(e),
    );
    this.container.addEventListener("lostpointercapture", (e) =>
      this.handlePointerEnd(e),
    );
    this.container.addEventListener("wheel", (e) => this.handleWheel(e), {
      passive: false,
    });
  }

  refreshLayout() {
    const containerRect = this.container.getBoundingClientRect();
    const imageRect = this.img.getBoundingClientRect();
    this.layout = {
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      imageWidth:
        this.img.offsetWidth || imageRect.width / this.state.scale || 0,
      imageHeight:
        this.img.offsetHeight || imageRect.height / this.state.scale || 0,
    };
  }

  updateTransform() {
    this.img.style.transform = `translate3d(${this.state.x}px, ${this.state.y}px, 0) scale(${this.state.scale})`;
  }

  scheduleTransform() {
    if (this.transformRafId !== null) return;
    this.transformRafId = requestAnimationFrame(() => {
      this.transformRafId = null;
      this.updateTransform();
    });
  }

  cancelAnimation() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.transformRafId !== null) {
      cancelAnimationFrame(this.transformRafId);
      this.transformRafId = null;
    }
  }

  reset() {
    this.state = { scale: 1, x: 0, y: 0 };
    this.vx = 0;
    this.vy = 0;
    this.activePointers.clear();
    this.isDragging = false;
    this.initialDistance = 0;
    this.cancelAnimation();
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
    this.cancelAnimation();
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

  startInertia() {
    const curW = this.layout.imageWidth * this.state.scale;
    const curH = this.layout.imageHeight * this.state.scale;
    const winW = this.layout.containerWidth;
    const winH = this.layout.containerHeight;
    const outOfBounds =
      (winW >= curW
        ? this.state.x > 0
        : this.state.x > 0 || this.state.x < winW - curW) ||
      (winH >= curH
        ? this.state.y > 0
        : this.state.y > 0 || this.state.y < winH - curH);
    if (Math.abs(this.vx) <= 0.1 && Math.abs(this.vy) <= 0.1 && !outOfBounds)
      return;
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => this.animate());
    }
  }

  animate() {
    this.rafId = null;
    if (this.isDragging) return;

    this.vx *= this.FRICTION;
    this.vy *= this.FRICTION;

    this.state.x += this.vx;
    this.state.y += this.vy;

    const curW = this.layout.imageWidth * this.state.scale;
    const curH = this.layout.imageHeight * this.state.scale;
    const winW = this.layout.containerWidth;
    const winH = this.layout.containerHeight;

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
      this.scheduleTransform();
      this.rafId = requestAnimationFrame(() => this.animate());
    }
  }

  handlePointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this.cancelAnimation();
    this.activePointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
    });
    this.container.setPointerCapture?.(e.pointerId);
    this.isDragging = true;
    this.vx = 0;
    this.vy = 0;

    if (this.activePointers.size === 2) {
      this.beginPinch();
    }
  }

  beginPinch() {
    const pointers = [...this.activePointers.values()];
    if (pointers.length !== 2) return;
    this.initialDistance = Math.hypot(
      pointers[1].x - pointers[0].x,
      pointers[1].y - pointers[0].y,
    );
    this.initialScale = this.state.scale;
    this.lastPinchCenter = {
      x: (pointers[0].x + pointers[1].x) / 2,
      y: (pointers[0].y + pointers[1].y) / 2,
    };
  }

  handlePointerMove(e) {
    if (!this.activePointers.has(e.pointerId)) return;
    if (e.cancelable) e.preventDefault();
    const previous = this.activePointers.get(e.pointerId);
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 1) {
      const dx = e.clientX - previous.x;
      const dy = e.clientY - previous.y;
      this.state.x += dx;
      this.state.y += dy;
      this.vx = dx;
      this.vy = dy;
      this.scheduleTransform();
      return;
    }

    if (this.activePointers.size !== 2 || this.initialDistance <= 0) return;
    const pointers = [...this.activePointers.values()];
    const currentDistance = Math.hypot(
      pointers[1].x - pointers[0].x,
      pointers[1].y - pointers[0].y,
    );
    const currentCenter = {
      x: (pointers[0].x + pointers[1].x) / 2,
      y: (pointers[0].y + pointers[1].y) / 2,
    };
    this.state.x += currentCenter.x - this.lastPinchCenter.x;
    this.state.y += currentCenter.y - this.lastPinchCenter.y;
    const newScale = Math.max(
      this.MIN_SCALE,
      Math.min(
        this.initialScale * (currentDistance / this.initialDistance),
        this.MAX_SCALE,
      ),
    );
    const containerRect = this.container.getBoundingClientRect();
    const relX = currentCenter.x - containerRect.left;
    const relY = currentCenter.y - containerRect.top;
    const imgX = relX - this.state.x;
    const imgY = relY - this.state.y;
    const scaleRatio = newScale / this.state.scale;
    this.state.x -= imgX * (scaleRatio - 1);
    this.state.y -= imgY * (scaleRatio - 1);
    this.state.scale = newScale;
    this.lastPinchCenter = currentCenter;
    this.scheduleTransform();
  }

  handlePointerEnd(e) {
    if (!this.activePointers.has(e.pointerId)) return;
    this.activePointers.delete(e.pointerId);
    if (this.container.hasPointerCapture?.(e.pointerId)) {
      this.container.releasePointerCapture?.(e.pointerId);
    }

    if (this.activePointers.size === 1) {
      this.beginPinch();
      const remaining = [...this.activePointers.values()][0];
      this.lastPinchCenter = { x: remaining.x, y: remaining.y };
      this.initialDistance = 0;
      this.vx = 0;
      this.vy = 0;
      this.isDragging = true;
      return;
    }
    this.initialDistance = 0;
    this.isDragging = false;
    this.startInertia();
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
export function setupSwipeAction(element, callback, options = {}) {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let isSwiping = false;
  let gestureAxis = null;
  let allowedDirection = "both";
  let callbackStarted = false;
  const resistance = Math.max(0, Math.min(options.resistance ?? 0.6, 1));
  const getAllowedDirection = options.getAllowedDirection || (() => "both");

  const reset = () => {
    element.style.transform = "";
    element.style.opacity = "1";
    element.style.transition = "transform 0.3s ease-out, opacity 0.3s";
    callbackStarted = false;
  };

  element.addEventListener(
    "touchstart",
    (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      currentX = 0;
      isSwiping = false;
      gestureAxis = null;
      callbackStarted = false;
      allowedDirection = getAllowedDirection(element) || "both";
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

      if (!gestureAxis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 8) {
        gestureAxis = Math.abs(deltaY) > Math.abs(deltaX) ? "vertical" : "horizontal";
      }
      if (gestureAxis === "vertical") {
        return;
      }

      if (!isSwiping && gestureAxis === "horizontal") {
        isSwiping = true;
      }

      if (isSwiping) {
        if (e.cancelable) e.preventDefault();
        currentX = deltaX * resistance;
        element.style.transform = `translateX(${currentX}px)`;

        const threshold = Math.max(
          options.minimumThreshold ?? 100,
          Math.min((element.getBoundingClientRect().width || 0) * 0.4, 180),
        );
        if (Math.abs(currentX) > threshold) {
          element.style.opacity = "0.6";
        } else {
          element.style.opacity = "1";
        }
      }
    },
    { passive: false },
  );

  element.addEventListener("touchend", () => {
    if (isSwiping) {
      const threshold = Math.max(
        options.minimumThreshold ?? 100,
        Math.min((element.getBoundingClientRect().width || 0) * 0.4, 180),
      );
      const direction = currentX > 0 ? "right" : "left";
      const permitted = allowedDirection === "both" || allowedDirection === direction;
      if (!callbackStarted && permitted && Math.abs(currentX) > threshold) {
        callbackStarted = true;
        const directionSign = currentX > 0 ? 1 : -1;
        element.style.transform = `translateX(${directionSign * 100}%)`;
        try {
          const result = callback();
          if (result && typeof result.then === "function") {
            result.then(reset, reset);
          } else {
            setTimeout(reset, 500);
          }
        } catch {
          reset();
        }
      }
    }
    if (!callbackStarted) reset();
    isSwiping = false;
    gestureAxis = null;
  });
}
