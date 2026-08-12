/**
 * 高度な画像ズーム（ピンチズーム、パン、慣性、バウンド、PCマウス・ホイール対応）を設定するクラス
 */
function calculateReleaseVelocity(samples) {
  if (samples.length < 2) return { x: 0, y: 0 };
  const latest = samples.at(-1);
  if (!latest || !Number.isFinite(latest.time)) return { x: 0, y: 0 };

  let first = null;
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    const candidate = samples[index];
    const elapsed = latest.time - candidate.time;
    if (Number.isFinite(elapsed) && elapsed > 0 && elapsed <= 120) {
      first = candidate;
    }
  }
  if (!first) return { x: 0, y: 0 };

  const elapsed = latest.time - first.time;
  return {
    x: (latest.x - first.x) / elapsed,
    y: (latest.y - first.y) / elapsed,
  };
}

export class GestureZoomController {
  constructor(container, img, options = {}) {
    this.container = container;
    this.img = img;
    this.overscrollLimit = Number.isFinite(options.overscrollLimit)
      ? Math.max(0, options.overscrollLimit)
      : 32;

    this.state = {
      scale: 1,
      x: 0,
      y: 0,
    };
    this.baseX = 0;
    this.baseY = 0;
    this.hasExplicitLayout = false;

    // 設定値
    this.MIN_SCALE = 1;
    this.MAX_SCALE = 5;
    this.FRICTION = 0.92; // 慣性の減衰率
    this.BOUNCE_FRICTION = 0.8; // バウンド時の減衰率

    this.isDragging = false;
    this.activePointers = new Map();
    this.vx = 0;
    this.vy = 0;
    this.panSamples = [];
    this.inertiaLastTimestamp = null;
    this.rafId = null;
    this.transformRafId = null;
    this.resizeObserver = null;
    this.layout = {
      containerWidth: 0,
      containerHeight: 0,
      stageWidth: 0,
      stageHeight: 0,
      originLeft: 0,
      originTop: 0,
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
    this.setDirectManipulation(false);
    if (this.hasExplicitLayout) return;
    const containerRect = this.container.getBoundingClientRect();
    const imageRect = this.img.getBoundingClientRect();
    this.layout = {
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      stageWidth:
        this.img.offsetWidth || imageRect.width / this.state.scale || 0,
      stageHeight:
        this.img.offsetHeight || imageRect.height / this.state.scale || 0,
      originLeft: containerRect.left,
      originTop: containerRect.top,
    };
  }

  setLayout({
    containerWidth,
    containerHeight,
    stageWidth,
    stageHeight,
    baseX = 0,
    baseY = 0,
  }) {
    if (
      ![containerWidth, containerHeight, stageWidth, stageHeight].every(
        Number.isFinite,
      )
    )
      return;
    this.hasExplicitLayout = true;
    const nextBaseX = Number.isFinite(baseX) ? baseX : 0;
    const nextBaseY = Number.isFinite(baseY) ? baseY : 0;
    const layoutChanged =
      this.layout.containerWidth !== containerWidth ||
      this.layout.containerHeight !== containerHeight ||
      this.layout.stageWidth !== stageWidth ||
      this.layout.stageHeight !== stageHeight ||
      this.baseX !== nextBaseX ||
      this.baseY !== nextBaseY;
    this.layout = {
      ...this.layout,
      containerWidth,
      containerHeight,
      stageWidth,
      stageHeight,
    };
    this.baseX = nextBaseX;
    this.baseY = nextBaseY;
    if (layoutChanged) this.reset();
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

  setDirectManipulation(active) {
    this.img.classList.toggle("is-direct-manipulation", active);
  }

  reset() {
    this.state = { scale: 1, x: this.baseX, y: this.baseY };
    this.vx = 0;
    this.vy = 0;
    this.panSamples = [];
    this.inertiaLastTimestamp = null;
    this.activePointers.clear();
    this.isDragging = false;
    this.initialDistance = 0;
    this.cancelAnimation();
    this.setDirectManipulation(false);
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
    this.panSamples = [];
    this.inertiaLastTimestamp = null;
    this.cancelAnimation();
    this.setDirectManipulation(false);
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

  getXBounds() {
    const width = this.layout.stageWidth * this.state.scale;
    return width >= this.layout.containerWidth
      ? [this.layout.containerWidth - width, 0]
      : [this.baseX, this.baseX];
  }

  getYBounds() {
    const height = this.layout.stageHeight * this.state.scale;
    return height >= this.layout.containerHeight
      ? [this.layout.containerHeight - height, 0]
      : [this.baseY, this.baseY];
  }

  applyPan(value, [min, max]) {
    return this.hasExplicitLayout
      ? applyRubberBand(value, min, max, this.overscrollLimit)
      : value;
  }

  startInertia() {
    const [xMin, xMax] = this.getXBounds();
    const [yMin, yMax] = this.getYBounds();
    const outOfBounds =
      this.state.x < xMin ||
      this.state.x > xMax ||
      this.state.y < yMin ||
      this.state.y > yMax;
    if (
      Math.abs(this.vx) <= 0.01 &&
      Math.abs(this.vy) <= 0.01 &&
      !outOfBounds
    ) {
      this.setDirectManipulation(false);
      return;
    }
    if (this.rafId === null) {
      this.inertiaLastTimestamp = null;
      this.rafId = requestAnimationFrame((timestamp) =>
        this.animate(timestamp),
      );
    }
  }

  animate(timestamp) {
    this.rafId = null;
    if (this.isDragging) return;

    const previousTimestamp = this.inertiaLastTimestamp;
    const validTimestamp = Number.isFinite(timestamp);
    const elapsed =
      previousTimestamp !== null &&
      validTimestamp &&
      timestamp > previousTimestamp
        ? Math.min(timestamp - previousTimestamp, 64)
        : 16;
    this.inertiaLastTimestamp = validTimestamp
      ? timestamp
      : previousTimestamp;

    let needsTransform = false;
    const advanceAxis = (axis, velocityKey, [min, max]) => {
      const position = this.state[axis];
      if (position < min || position > max) {
        const boundary = position < min ? min : max;
        const next = position + (boundary - position) * 0.2;
        this.state[axis] = Math.abs(boundary - next) < 0.25 ? boundary : next;
        this[velocityKey] = 0;
        needsTransform = true;
        return this.state[axis] !== boundary;
      }

      const next = position + this[velocityKey] * elapsed;
      if (next < min || next > max) {
        this.state[axis] = Math.max(min, Math.min(next, max));
        this[velocityKey] = 0;
        needsTransform = true;
        return false;
      }

      this.state[axis] = next;
      this[velocityKey] *= Math.pow(this.FRICTION, elapsed / 16);
      needsTransform ||= next !== position;
      return Math.abs(this[velocityKey]) > 0.01;
    };

    const xContinues = advanceAxis("x", "vx", this.getXBounds());
    const yContinues = advanceAxis("y", "vy", this.getYBounds());

    const shouldContinue =
      xContinues || yContinues;
    if (needsTransform || shouldContinue) {
      this.scheduleTransform();
    }
    if (shouldContinue) {
      this.rafId = requestAnimationFrame((nextTimestamp) =>
        this.animate(nextTimestamp),
      );
    } else {
      this.inertiaLastTimestamp = null;
      this.setDirectManipulation(false);
    }
  }

  handlePointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this.cancelAnimation();
    if (!this.hasExplicitLayout) {
      this.refreshLayout();
    } else {
      const rect = this.container.getBoundingClientRect();
      this.layout.originLeft = rect.left;
      this.layout.originTop = rect.top;
    }
    this.activePointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
    });
    this.container.setPointerCapture?.(e.pointerId);
    this.isDragging = true;
    this.setDirectManipulation(true);
    this.vx = 0;
    this.vy = 0;

    if (this.activePointers.size === 2) {
      this.panSamples = [];
      this.beginPinch();
    } else {
      this.panSamples = [
        { x: e.clientX, y: e.clientY, time: e.timeStamp },
      ];
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
      this.state.x = this.applyPan(this.state.x + dx, this.getXBounds());
      this.state.y = this.applyPan(this.state.y + dy, this.getYBounds());
      if (Number.isFinite(e.timeStamp)) {
        this.panSamples.push({
          x: e.clientX,
          y: e.clientY,
          time: e.timeStamp,
        });
        while (
          this.panSamples.length > 1 &&
          Number.isFinite(this.panSamples[0].time) &&
          e.timeStamp - this.panSamples[0].time > 120
        ) {
          this.panSamples.shift();
        }
      }
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
    const relX = currentCenter.x - this.layout.originLeft;
    const relY = currentCenter.y - this.layout.originTop;
    const imgX = relX - this.state.x;
    const imgY = relY - this.state.y;
    const scaleRatio = newScale / this.state.scale;
    this.state.x -= imgX * (scaleRatio - 1);
    this.state.y -= imgY * (scaleRatio - 1);
    this.state.scale = newScale;
    this.state.x = this.applyPan(this.state.x, this.getXBounds());
    this.state.y = this.applyPan(this.state.y, this.getYBounds());
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
      this.panSamples = [];
      this.isDragging = true;
      return;
    }
    this.initialDistance = 0;
    this.isDragging = false;
    this.setDirectManipulation(true);
    const releaseVelocity = calculateReleaseVelocity(this.panSamples);
    this.vx = releaseVelocity.x;
    this.vy = releaseVelocity.y;
    this.panSamples = [];
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

export function applyRubberBand(value, min, max, overscrollLimit = 32) {
  if (min > max) [min, max] = [max, min];
  if (value >= min && value <= max) return value;
  const limit = Math.max(0, overscrollLimit);
  if (!limit) return Math.max(min, Math.min(value, max));
  const edge = value < min ? min : max;
  const overflow = Math.abs(value - edge);
  return (
    edge + (Math.sign(value - edge) * (limit * overflow)) / (limit + overflow)
  );
}

export function calculateSwipeTranslation(rawDelta, triggerDistance) {
  if (
    !Number.isFinite(rawDelta) ||
    !Number.isFinite(triggerDistance) ||
    triggerDistance <= 0
  ) {
    return rawDelta;
  }
  const progress = Math.min(Math.abs(rawDelta) / triggerDistance, 1);
  const eased = progress * progress * (3 - 2 * progress);
  const ratio = 0.28 + (0.9 - 0.28) * eased;
  return Math.sign(rawDelta) * Math.abs(rawDelta) * ratio;
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
  let purchaseTriggerDistance = 0;
  let rawDelta = 0;
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
      rawDelta = 0;
      isSwiping = false;
      gestureAxis = null;
      callbackStarted = false;
      allowedDirection = getAllowedDirection(element) || "both";
      const visualThreshold = Math.max(
        options.minimumThreshold ?? 100,
        Math.min((element.getBoundingClientRect().width || 0) * 0.4, 180),
      );
      purchaseTriggerDistance = visualThreshold / 0.6;
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
        gestureAxis =
          Math.abs(deltaY) > Math.abs(deltaX) ? "vertical" : "horizontal";
      }
      if (gestureAxis === "vertical") {
        return;
      }

      if (!isSwiping && gestureAxis === "horizontal") {
        isSwiping = true;
      }

      if (isSwiping) {
        if (e.cancelable) e.preventDefault();
        rawDelta = deltaX;
        currentX = calculateSwipeTranslation(rawDelta, purchaseTriggerDistance);
        element.style.transform = `translateX(${currentX}px)`;

        if (Math.abs(rawDelta) > purchaseTriggerDistance) {
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
      const direction = rawDelta > 0 ? "right" : "left";
      const permitted =
        allowedDirection === "both" || allowedDirection === direction;
      if (
        !callbackStarted &&
        permitted &&
        Math.abs(rawDelta) > purchaseTriggerDistance
      ) {
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
