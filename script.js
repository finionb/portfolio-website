(function () {
  const EASE_OUT_CUBIC = (t) => 1 - Math.pow(1 - t, 3);

  function initSlider(viewport) {
    const track = viewport.querySelector(".projects-grid");
    if (!track) return;

    const cards = Array.from(track.children);
    const section = viewport.closest(".section");
    if (!cards.length || !section) return;

    const headingText = section.querySelector(".heading-text");

    cards.forEach((card) => {
      card.draggable = false;
      card.addEventListener("dragstart", (e) => e.preventDefault());
      const img = card.querySelector("img");
      if (img) {
        img.draggable = false;
        img.addEventListener("dragstart", (e) => e.preventDefault());
      }
    });

    let x = 0;
    let minX = 0;
    let maxX = 0;
    let snapPoints = [0];
    let initialized = false;

    let isDragging = false;
    let dragStartX = 0;
    let dragStartPointerX = 0;
    let dragDistance = 0;
    let pointerId = null;
    let moveSamples = [];

    let rafId = null;

    function measure() {
      const gap = parseFloat(getComputedStyle(track).gap) || 0;
      const viewportRect = viewport.getBoundingClientRect();

      const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const gutter = remPx * 2;
      const docWidth = window.innerWidth;

      const lineLeft = headingText
        ? headingText.getBoundingClientRect().left
        : gutter;
      const lineRight = docWidth - gutter;

      const startOffset = lineLeft - viewportRect.left;

      let cumulative = 0;
      snapPoints = cards.map((card) => {
        const point = startOffset - cumulative;
        cumulative += card.getBoundingClientRect().width + gap;
        return point;
      });

      maxX = startOffset;
      const lastCard = cards[cards.length - 1];
      const lastCardRight = lastCard.getBoundingClientRect().right - x;
      minX = Math.min(maxX, lineRight - lastCardRight);

      if (snapPoints.length) {
        snapPoints[snapPoints.length - 1] = minX;
      }

      x = initialized ? clamp(x, minX, maxX) : maxX;
      initialized = true;
      setTransform();
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function setTransform() {
      track.style.transform = `translate3d(${x}px, 0, 0)`;
    }

    function nearestSnapIndex(value) {
      let nearest = 0;
      let nearestDist = Infinity;
      snapPoints.forEach((point, i) => {
        const dist = Math.abs(point - value);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = i;
        }
      });
      return nearest;
    }

    function cancelAnimation() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function animateTo(targetX, opts) {
      opts = opts || {};
      cancelAnimation();
      targetX = clamp(targetX, minX, maxX);

      const startX = x;
      const distance = Math.abs(targetX - startX);
      const duration = opts.duration || clamp(distance * 0.55, 320, 650);
      const startTime = performance.now();

      function step(now) {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        const eased = EASE_OUT_CUBIC(t);
        x = startX + (targetX - startX) * eased;
        setTransform();

        if (t < 1) {
          rafId = requestAnimationFrame(step);
        } else {
          x = targetX;
          setTransform();
          rafId = null;
        }
      }

      rafId = requestAnimationFrame(step);
    }

    function snapToNearest(predictedX) {
      const idx = nearestSnapIndex(predictedX);
      animateTo(snapPoints[idx]);
    }

    function getClientX(e) {
      return e.clientX;
    }

    function onPointerDown(e) {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;
      cancelAnimation();
      isDragging = true;
      dragDistance = 0;
      dragStartX = x;
      dragStartPointerX = getClientX(e);
      pointerId = e.pointerId;
      moveSamples = [{ time: performance.now(), x: dragStartPointerX }];
      viewport.classList.add("is-dragging");
      viewport.setPointerCapture(pointerId);
    }

    function onPointerMove(e) {
      if (!isDragging || e.pointerId !== pointerId) return;
      const clientX = getClientX(e);
      const delta = clientX - dragStartPointerX;
      dragDistance = Math.max(dragDistance, Math.abs(delta));

      x = clamp(dragStartX + delta, minX, maxX);
      setTransform();

      moveSamples.push({ time: performance.now(), x: clientX });
      if (moveSamples.length > 6) moveSamples.shift();

      if (dragDistance > 4) {
        e.preventDefault();
      }
    }

    function onPointerUp(e) {
      if (!isDragging || e.pointerId !== pointerId) return;
      isDragging = false;
      viewport.classList.remove("is-dragging");
      try {
        viewport.releasePointerCapture(pointerId);
      } catch (err) {
        /* noop */
      }

      let velocity = 0;
      if (moveSamples.length >= 2) {
        const last = moveSamples[moveSamples.length - 1];
        const first = moveSamples[0];
        const dt = last.time - first.time;
        if (dt > 0) {
          velocity = (last.x - first.x) / dt;
        }
      }

      const momentumFactor = 110;
      const predictedX = x + velocity * momentumFactor;
      snapToNearest(predictedX);

      pointerId = null;
      moveSamples = [];
    }

    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", onPointerUp);
    viewport.addEventListener("pointercancel", onPointerUp);

    cards.forEach((card) => {
      card.addEventListener("click", (e) => {
        if (dragDistance > 6) {
          e.preventDefault();
        }
      });
    });

    let wheelIdleTimer = null;
    viewport.addEventListener(
      "wheel",
      (e) => {
        const horizontalIntent = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
        if (!horizontalIntent) return;
        e.preventDefault();
        cancelAnimation();

        const delta = e.shiftKey && Math.abs(e.deltaX) < 1 ? e.deltaY : e.deltaX;
        x = clamp(x - delta, minX, maxX);
        setTransform();

        clearTimeout(wheelIdleTimer);
        wheelIdleTimer = setTimeout(() => {
          snapToNearest(x);
        }, 120);
      },
      { passive: false }
    );

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        cancelAnimation();
        measure();
      }, 150);
    });

    measure();
  }

  document.querySelectorAll(".projects-viewport").forEach(initSlider);
})();

(function () {
  const burger = document.querySelector(".nav-burger");
  const navLinks = document.querySelector(".nav-links");
  if (burger && navLinks) {
    burger.addEventListener("click", () => {
      const isOpen = burger.classList.toggle("is-open");
      navLinks.classList.toggle("is-open", isOpen);
      document.body.style.overflow = isOpen ? "hidden" : "";
    });
    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        burger.classList.remove("is-open");
        navLinks.classList.remove("is-open");
        document.body.style.overflow = "";
      });
    });
  }
})();

(function () {
  if (window.matchMedia("(hover: none)").matches) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle("in-view", entry.isIntersecting);
        });
      },
      { threshold: 0.7 }
    );
    document.querySelectorAll(".project-card").forEach((card) => observer.observe(card));
  }
})();

(function () {
  const images = document.querySelectorAll(".slideshow-image");
  if (images.length < 2) return;

  let activeIndex = Array.from(images).findIndex((img) =>
    img.classList.contains("is-active")
  );
  if (activeIndex < 0) activeIndex = 0;

  setInterval(() => {
    const nextIndex = (activeIndex + 1) % images.length;
    images[activeIndex].classList.remove("is-active");
    images[nextIndex].classList.add("is-active");
    activeIndex = nextIndex;
  }, 1500);
})();