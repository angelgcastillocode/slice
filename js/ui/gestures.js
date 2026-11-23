/**
 * Slice UX - Step 2: Draggable Liquid Glass Dock, Full-Screen Swipe & Sheet Dismiss
 * Pure Vanilla JS, GPU-composited (transform + opacity), zero layout reads during move.
 */

export const TAB_ORDER = ['inicio', 'calendario', 'tarjetas', 'fijos'];

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rubberBand(value, min, max, factor = 0.25, maxOvershoot = 24) {
  if (value < min) {
    return min - Math.min(maxOvershoot, (min - value) * factor);
  }
  if (value > max) {
    return max + Math.min(maxOvershoot, (value - max) * factor);
  }
  return value;
}

export function initDockController({ navEl, lensEl, onSelectTab, getActiveTab }) {
  if (!navEl || !lensEl) {
    return {
      beginExternalTrack() {},
      setExternalProgress() {},
      endExternalTrack() {},
      syncActiveTab() {},
      shouldIgnoreClick() {
        return false;
      }
    };
  }

  const navItems = Array.from(navEl.querySelectorAll('.nav-item[data-tab]'));
  const pad = 4;
  let navLeft = 0;
  let slotW = 0;
  let maxX = 0;

  let activePointerId = null;
  let startX = 0;
  let hasDragged = false;
  let hoveredIdx = 0;
  let isExternalTracking = false;
  let lastHandledPointerEnd = 0;

  function measure() {
    const rect = navEl.getBoundingClientRect();
    if (rect.width <= 0) return false;
    navLeft = rect.left;
    slotW = (rect.width - pad * 2) / TAB_ORDER.length;
    maxX = slotW * (TAB_ORDER.length - 1);
    return true;
  }

  function setLensFocus(index) {
    navItems.forEach((item, idx) => {
      item.classList.toggle('is-lens-focus', index !== null && idx === index);
    });
  }

  function placeLensAtIndex(index, { instant = false } = {}) {
    const safeIdx = clamp(index, 0, TAB_ORDER.length - 1);
    if (slotW <= 0 && !measure()) return;

    const targetX = (safeIdx * slotW).toFixed(2);
    if (instant || prefersReducedMotion()) {
      lensEl.classList.add('is-instant');
      lensEl.style.transform = `translate3d(${targetX}px, 0, 0)`;
      void lensEl.offsetWidth;
      lensEl.classList.remove('is-instant');
    } else {
      lensEl.style.transform = `translate3d(${targetX}px, 0, 0)`;
    }
  }

  function syncFromViewport() {
    if (activePointerId !== null || isExternalTracking) return;
    if (!measure()) return;
    const idx = Math.max(0, TAB_ORDER.indexOf(getActiveTab()));
    placeLensAtIndex(idx, { instant: true });
  }

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(syncFromViewport);
    ro.observe(navEl);
  }
  window.addEventListener('resize', syncFromViewport, { passive: true });
  window.addEventListener('orientationchange', syncFromViewport, { passive: true });
  document.fonts?.ready?.then(syncFromViewport);

  navEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!measure()) return;

    activePointerId = e.pointerId;
    startX = e.clientX;
    hasDragged = false;
    hoveredIdx = clamp(Math.floor((e.clientX - navLeft - pad) / slotW), 0, TAB_ORDER.length - 1);

    try {
      navEl.setPointerCapture?.(e.pointerId);
    } catch (_err) {}
  });

  navEl.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointerId) return;

    if (!hasDragged && Math.abs(e.clientX - startX) >= 6) {
      hasDragged = true;
      navEl.classList.add('is-scrubbing');
      lensEl.classList.add('is-scrubbing');
    }

    if (hasDragged) {
      const rawX = e.clientX - navLeft - pad - slotW / 2;
      const x = rubberBand(rawX, 0, maxX, 0.25, slotW * 0.22);
      const scale = prefersReducedMotion() ? '' : ' scale(1.06, 0.96)';
      lensEl.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)${scale}`;
      hoveredIdx = clamp(Math.round(clamp(rawX, 0, maxX) / slotW), 0, TAB_ORDER.length - 1);
      setLensFocus(hoveredIdx);
    }
  });

  function finishPointer(e) {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;

    try {
      if (navEl.hasPointerCapture?.(e.pointerId)) {
        navEl.releasePointerCapture(e.pointerId);
      }
    } catch (_err) {}

    navEl.classList.remove('is-scrubbing');
    lensEl.classList.remove('is-scrubbing');
    setLensFocus(null);
    lastHandledPointerEnd = performance.now();

    if (e.type === 'pointercancel') {
      const currentIdx = Math.max(0, TAB_ORDER.indexOf(getActiveTab()));
      placeLensAtIndex(currentIdx);
      return;
    }

    const targetIdx = hasDragged
      ? hoveredIdx
      : clamp(Math.floor((e.clientX - navLeft - pad) / slotW), 0, TAB_ORDER.length - 1);

    placeLensAtIndex(targetIdx);
    const targetTab = TAB_ORDER[targetIdx];
    if (targetTab && targetTab !== getActiveTab()) {
      onSelectTab(targetTab);
    }
  }

  navEl.addEventListener('pointerup', finishPointer);
  navEl.addEventListener('pointercancel', finishPointer);

  return {
    beginExternalTrack() {
      if (!measure()) return;
      isExternalTracking = true;
      navEl.classList.add('is-scrubbing');
      lensEl.classList.add('is-scrubbing');
    },
    setExternalProgress(floatIdx) {
      if (!isExternalTracking || slotW <= 0) return;
      const rawX = floatIdx * slotW;
      const x = rubberBand(rawX, 0, maxX, 0.25, slotW * 0.22);
      const scale = prefersReducedMotion() ? '' : ' scale(1.04, 0.97)';
      lensEl.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)${scale}`;
      setLensFocus(clamp(Math.round(floatIdx), 0, TAB_ORDER.length - 1));
    },
    endExternalTrack(targetIdx) {
      isExternalTracking = false;
      navEl.classList.remove('is-scrubbing');
      lensEl.classList.remove('is-scrubbing');
      setLensFocus(null);
      placeLensAtIndex(targetIdx);
    },
    syncActiveTab(tabKey, { instant = false } = {}) {
      if (activePointerId !== null || isExternalTracking) return;
      const idx = TAB_ORDER.indexOf(tabKey);
      if (idx === -1) return;
      placeLensAtIndex(idx, { instant });
    },
    shouldIgnoreClick() {
      return performance.now() - lastHandledPointerEnd < 350;
    }
  };
}

function isFormElement(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function hasHorizontalScrollAncestor(target, stopEl) {
  let node = target;
  while (node && node !== stopEl && node !== document.body) {
    if (node.classList?.contains('horizontal-carousel') || node.classList?.contains('pill-row')) {
      return true;
    }
    if (node.scrollWidth > node.clientWidth + 1) {
      const style = window.getComputedStyle(node);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
        return true;
      }
    }
    node = node.parentElement;
  }
  return false;
}

export function initScreenSwipeController({
  mainEl,
  getActiveTab,
  isSwipeAllowed,
  getActiveViewSection,
  dockController,
  onSelectTab
}) {
  if (!mainEl) return;

  let tracking = false;
  let axis = null;
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocityX = 0;
  let viewportWidth = 390;
  let currentIdx = 0;
  let activeSection = null;
  let snapBackTimer = null;

  function clearSectionGestureStyles(section) {
    if (!section) return;
    section.classList.remove('is-swiping', 'is-snapping-back');
    section.style.transform = '';
    section.style.opacity = '';
  }

  mainEl.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      if (!isSwipeAllowed()) return;

      const touch = e.touches[0];
      if (touch.clientX < 24) return;
      if (isFormElement(document.activeElement) || isFormElement(e.target)) return;
      if (hasHorizontalScrollAncestor(e.target, mainEl)) return;

      if (snapBackTimer) {
        clearTimeout(snapBackTimer);
        snapBackTimer = null;
        mainEl.querySelectorAll('.view-section').forEach(clearSectionGestureStyles);
      }

      const section = getActiveViewSection();
      if (!section) return;

      startX = touch.clientX;
      startY = touch.clientY;
      startTime = performance.now();
      lastX = startX;
      lastTime = startTime;
      velocityX = 0;
      viewportWidth = mainEl.clientWidth || window.innerWidth || 390;
      currentIdx = Math.max(0, TAB_ORDER.indexOf(getActiveTab()));
      activeSection = section;
      axis = null;
      tracking = true;
    },
    { passive: true }
  );

  mainEl.addEventListener(
    'touchmove',
    (e) => {
      if (!tracking || !activeSection || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (axis === null) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          axis = 'y';
          tracking = false;
          return;
        }
        axis = 'x';
        activeSection.classList.remove(
          'view-entering',
          'view-enter-from-right',
          'view-enter-from-left',
          'is-snapping-back'
        );
        activeSection.classList.add('is-swiping');
        dockController.beginExternalTrack();
      }

      if (axis !== 'x') return;
      if (e.cancelable) e.preventDefault();

      const now = performance.now();
      const dt = now - lastTime;
      if (dt > 0) {
        velocityX = (touch.clientX - lastX) / dt;
      }
      lastX = touch.clientX;
      lastTime = now;

      const isAtLeftEdge = currentIdx === 0 && dx > 0;
      const isAtRightEdge = currentIdx === TAB_ORDER.length - 1 && dx < 0;
      const appliedDx = isAtLeftEdge || isAtRightEdge ? dx * 0.25 : dx;

      if (!prefersReducedMotion()) {
        activeSection.style.transform = `translate3d(${appliedDx.toFixed(2)}px, 0, 0)`;
        if (!(isAtLeftEdge || isAtRightEdge)) {
          activeSection.style.opacity = String(
            Math.max(0.72, 1 - Math.abs(appliedDx) / (viewportWidth * 1.45))
          );
        }
      }

      dockController.setExternalProgress(currentIdx + -dx / viewportWidth);
    },
    { passive: false }
  );

  function finishTouch(e) {
    if (!tracking) return;
    tracking = false;

    if (axis !== 'x' || !activeSection) {
      axis = null;
      activeSection = null;
      return;
    }

    const section = activeSection;
    activeSection = null;
    axis = null;
    section.classList.remove('is-swiping');

    const totalDx = lastX - startX;
    const now = performance.now();
    const effectiveVel =
      now - lastTime < 85 ? velocityX : totalDx / Math.max(1, now - startTime);

    const passedDistance = Math.abs(totalDx) >= viewportWidth * 0.25;
    const passedFlick = Math.abs(effectiveVel) > 0.35 && Math.abs(totalDx) > 18;

    let nextIdx = currentIdx;
    if (e.type === 'touchend' && (passedDistance || passedFlick)) {
      if (totalDx < 0 && currentIdx < TAB_ORDER.length - 1) {
        nextIdx = currentIdx + 1;
      } else if (totalDx > 0 && currentIdx > 0) {
        nextIdx = currentIdx - 1;
      }
    }

    if (nextIdx !== currentIdx) {
      section.style.transform = '';
      section.style.opacity = '';
      dockController.endExternalTrack(nextIdx);
      onSelectTab(TAB_ORDER[nextIdx]);
      return;
    }

    dockController.endExternalTrack(currentIdx);
    section.classList.add('is-snapping-back');
    section.style.transform = 'translate3d(0, 0, 0)';
    section.style.opacity = '1';

    snapBackTimer = setTimeout(() => {
      clearSectionGestureStyles(section);
      snapBackTimer = null;
    }, 290);
  }

  mainEl.addEventListener('touchend', finishTouch, { passive: true });
  mainEl.addEventListener('touchcancel', finishTouch, { passive: true });
}

export function initSheetDismissGestures({ overlayIds, onDismissOverlay }) {
  overlayIds.forEach((id) => {
    const overlayEl = document.getElementById(id);
    if (!overlayEl) return;

    let tracking = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lastTime = 0;
    let velY = 0;
    let sheetEl = null;
    let sheetHeight = 320;

    overlayEl.addEventListener(
      'touchstart',
      (e) => {
        if (!overlayEl.classList.contains('open') || e.touches.length !== 1) return;
        const target = e.target;
        const candidateSheet = target?.closest?.('.bottom-sheet');
        if (!candidateSheet) return;
        if (candidateSheet.scrollTop > 0) return;
        if (target.closest('button, input, select, textarea, a')) return;

        const touch = e.touches[0];
        const rect = candidateSheet.getBoundingClientRect();
        const isHandle = Boolean(target.closest('.sheet-handle'));
        const inTopHeader = touch.clientY - rect.top <= 68;
        if (!isHandle && !inTopHeader) return;

        sheetEl = candidateSheet;
        sheetHeight = rect.height || 320;
        startX = touch.clientX;
        startY = touch.clientY;
        lastY = startY;
        lastTime = performance.now();
        velY = 0;
        dragging = false;
        tracking = true;
      },
      { passive: true }
    );

    overlayEl.addEventListener(
      'touchmove',
      (e) => {
        if (!tracking || !sheetEl || e.touches.length !== 1) return;

        const touch = e.touches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;

        if (!dragging) {
          if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
          if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
            tracking = false;
            sheetEl = null;
            return;
          }
          dragging = true;
          sheetEl.classList.add('is-dragging');
        }

        if (dy < 0) return;
        if (e.cancelable) e.preventDefault();

        const now = performance.now();
        const dt = now - lastTime;
        if (dt > 0) {
          velY = (touch.clientY - lastY) / dt;
        }
        lastY = touch.clientY;
        lastTime = now;

        if (!prefersReducedMotion()) {
          sheetEl.style.transform = `translate3d(0, ${dy.toFixed(2)}px, 0)`;
        }
      },
      { passive: false }
    );

    function finishSheetDrag(e) {
      if (!tracking) return;
      tracking = false;

      const sheet = sheetEl;
      sheetEl = null;
      if (!sheet || !dragging) return;
      dragging = false;

      sheet.classList.remove('is-dragging');
      sheet.style.transform = '';

      const totalDy = lastY - startY;
      if (
        e.type === 'touchend' &&
        (totalDy > Math.min(110, sheetHeight * 0.24) || (velY > 0.45 && totalDy > 30))
      ) {
        onDismissOverlay(overlayEl);
      }
    }

    overlayEl.addEventListener('touchend', finishSheetDrag, { passive: true });
    overlayEl.addEventListener('touchcancel', finishSheetDrag, { passive: true });
  });
}
