/**
 * =====================================================================
 * Space Rabbit — Main JavaScript
 * =====================================================================
 *
 * This file contains all client-side behaviour for the Space Rabbit
 * landing page.  It is loaded at the end of <body> so the DOM is
 * guaranteed to be ready — no DOMContentLoaded wrapper needed.
 *
 * Sections:
 *   1. Theme Toggle (dark / light mode)
 *   2. Starfield Canvas Animation
 *   3. Scroll Hint Button
 *   4. Footer Author Randomisation
 *   5. Comparison Animation Loop
 * =====================================================================
 */


/* =====================================================================
   1. Theme Toggle
   =====================================================================
   Toggles between dark mode (default) and light mode by adding or
   removing the `.light` class on <body>.  The user's preference is
   persisted in localStorage so it survives page reloads.

   Two SVG icons (moon and sun) are swapped via display:none/block
   to indicate the current mode.
   ===================================================================== */

/** @type {HTMLButtonElement} The toggle button in the top-right corner */
const themeToggleBtn = document.getElementById("theme-toggle");

/** @type {SVGElement} Moon icon — shown when dark mode is active */
const moonIcon = document.getElementById("icon-moon");

/** @type {SVGElement} Sun icon — shown when light mode is active */
const sunIcon = document.getElementById("icon-sun");

/**
 * Apply a colour mode to the page.
 *
 * @param {boolean} isLight - `true` for light mode, `false` for dark.
 */
function setColorMode(isLight) {
  // Toggle the `.light` class on <body> which triggers CSS overrides
  document.body.classList.toggle("light", isLight);

  // Swap the icon visibility to match the active mode
  moonIcon.style.display = isLight ? "none" : "block";
  sunIcon.style.display = isLight ? "block" : "none";

  // Persist the preference so it's restored on the next visit
  localStorage.setItem("theme", isLight ? "light" : "dark");
}

// On page load, restore the saved preference (defaults to dark if no
// preference has been saved yet).
setColorMode(localStorage.getItem("theme") === "light");

// Toggle mode on click — invert the current state.
themeToggleBtn.addEventListener("click", () => {
  const isCurrentlyLight = document.body.classList.contains("light");
  setColorMode(!isCurrentlyLight);
});


/* =====================================================================
   2. Starfield Canvas Animation
   =====================================================================
   Renders a subtle, continuously-moving star field on a fixed <canvas>
   behind all page content.  Stars radiate outward from the centre of
   the viewport.

   The animation has two special interactive states:
     - **Warp mode**: triggered when the user hovers over the download
       button.  Stars speed up dramatically and 40% of them draw
       motion-blur "streak" trails.
     - **Pause**: the animation freezes when the tab loses focus or
       when light mode is active (where stars aren't visible anyway).

   The entire starfield is skipped on mobile (≤ 768px) to save
   battery and avoid rendering something too small to appreciate.
   ===================================================================== */

(function initStarfield() {
  // ── Guard: skip on mobile devices ──────────────────────────────────
  // The CSS also hides the canvas at this breakpoint, but we skip the
  // entire JS setup too to avoid unnecessary CPU / GPU work.
  if (window.matchMedia("(max-width: 768px)").matches) {
    return;
  }

  /** @type {HTMLCanvasElement} The full-viewport background canvas */
  const canvas = document.getElementById("stars");

  /** @type {CanvasRenderingContext2D} 2D drawing context */
  const ctx = canvas.getContext("2d");

  /** Total number of stars to render each frame */
  const STAR_COUNT = 180;

  /** @type {Array<Object>} Array of star objects (angle, dist, speed, etc.) */
  let stars = [];

  // Viewport dimensions and centre point (updated on resize)
  let viewportWidth, viewportHeight, centreX, centreY;

  /**
   * Resize the canvas to match the current window dimensions and
   * recalculate the centre point.  Called on window resize and
   * during initialisation.
   */
  function handleResize() {
    viewportWidth = canvas.width = window.innerWidth;
    viewportHeight = canvas.height = window.innerHeight;
    centreX = viewportWidth / 2;
    centreY = viewportHeight / 2;
  }

  /**
   * Create a new star object with randomised properties.
   *
   * Each star has:
   *   - `angle`   — direction from centre (radians, 0–2π)
   *   - `dist`    — normalised distance from centre (0 = centre, 1 = edge)
   *   - `speed`   — base outward velocity per frame
   *   - `streaker` — whether this star can draw a motion-blur trail
   *                  during warp mode (40% chance)
   *
   * @returns {Object} A fresh star object.
   */
  function createRandomStar() {
    return {
      angle: Math.random() * Math.PI * 2,
      dist: Math.random() * 0.3,
      speed: Math.random() * 0.00006 + 0.00002,
      streaker: Math.random() < 0.4,
    };
  }

  /**
   * Initialise the canvas and populate the stars array.
   * Stars are scattered across the full field (dist = 0–1) so the
   * viewport isn't empty on the first frame.
   */
  function init() {
    handleResize();

    stars = Array.from({ length: STAR_COUNT }, () => {
      const star = createRandomStar();

      // Override the default near-centre dist so stars appear
      // spread across the entire viewport from the start.
      star.dist = Math.random();

      return star;
    });
  }

  // ── Animation state ────────────────────────────────────────────────

  /** Current speed multiplier (lerps toward targetSpeed each frame) */
  let speed = 1;

  /** Target speed — 1 = normal, 12 = warp, 0 = paused */
  let targetSpeed = 1;

  /** Current warp intensity (0 = off, 1 = full warp) */
  let warp = 0;

  /** Target warp intensity (lerps toward this each frame) */
  let targetWarp = 0;

  /**
   * Main render loop — called once per animation frame via rAF.
   *
   * Smoothly interpolates `speed` and `warp` toward their targets,
   * then updates and draws every star.  Stars that drift past the
   * viewport edge are recycled with fresh random properties.
   */
  function draw() {
    // ── Determine effective speed ──────────────────────────────────
    // Pause the animation when the page is in light mode (stars
    // aren't visible) or when the tab isn't focused (save CPU).
    const isLightMode = document.body.classList.contains("light");
    const isTabFocused = document.hasFocus() && !document.hidden;
    const effectiveTarget = isLightMode || !isTabFocused ? 0 : targetSpeed;

    // Smoothly interpolate toward the target (exponential ease-out).
    // The 0.04 / 0.05 factors control how quickly the transition
    // feels — smaller = slower / smoother.
    speed += (effectiveTarget - speed) * 0.04;

    const effectiveWarp =
      isTabFocused && !isLightMode ? targetWarp : 0;
    warp += (effectiveWarp - warp) * 0.05;

    // ── Clear and prepare ──────────────────────────────────────────
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);

    // Maximum possible distance from centre to a viewport corner
    const maxRadius = Math.hypot(centreX, centreY);

    // ── Update and draw each star ──────────────────────────────────
    for (const star of stars) {
      // Move the star outward from the centre.  The acceleration
      // term (dist * 0.003) makes stars speed up as they get
      // further from the centre, creating a natural parallax.
      star.dist += (star.speed + star.dist * 0.003) * speed;

      // Convert polar (angle + normalised dist) to Cartesian (x, y)
      const distance = star.dist * maxRadius;
      const x = centreX + Math.cos(star.angle) * distance;
      const y = centreY + Math.sin(star.angle) * distance;

      // Progress: 0 at centre → 1 at edge (clamped)
      const progress = Math.min(star.dist, 1);

      // Opacity ramps up as the star moves outward (so stars near
      // the centre are invisible, preventing a bright cluster).
      const baseOpacity = Math.min(progress * 1.4, 0.45);
      const opacity = baseOpacity + warp * 0.4;

      // ── Draw streak trail (warp mode only) ─────────────────────
      // During warp, "streaker" stars draw a fading line from their
      // previous position to their current position, creating a
      // motion-blur / hyperspace effect.
      if (warp > 0.01 && star.streaker) {
        const streakLength = warp * 0.06;
        const previousDist =
          Math.max(0, star.dist - streakLength) * maxRadius;
        const prevX = centreX + Math.cos(star.angle) * previousDist;
        const prevY = centreY + Math.sin(star.angle) * previousDist;

        // Gradient from transparent (tail) to semi-opaque (head)
        const gradient = ctx.createLinearGradient(prevX, prevY, x, y);
        gradient.addColorStop(0, "rgba(200, 200, 255, 0)");
        gradient.addColorStop(
          1,
          `rgba(200, 200, 255, ${opacity * 0.35})`
        );

        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = progress * 0.8 + 0.1;
        ctx.stroke();
      }

      // ── Draw the star dot ──────────────────────────────────────
      // Streaker stars get a slightly dimmer dot so the streak
      // trail is the visual focus, not the dot itself.
      const dotOpacity =
        warp > 0.01 && star.streaker ? opacity * 0.6 : opacity;

      ctx.beginPath();
      ctx.arc(x, y, progress * 2.2 + 0.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 200, 255, ${dotOpacity})`;
      ctx.fill();

      // ── Recycle stars that have left the viewport ──────────────
      if (star.dist > 1) {
        Object.assign(star, createRandomStar());
      }
    }

    // Schedule the next frame
    requestAnimationFrame(draw);
  }

  // ── Download button hover → warp effect ────────────────────────────
  // Hovering the CTA button triggers the hyperspace warp animation.
  // Pressing the button momentarily freezes everything for a "click"
  // feel, then resumes warp on mouse-up.
  const downloadBtn = document.querySelector(".btn-download");

  downloadBtn.addEventListener("mouseenter", () => {
    targetSpeed = 12;
    targetWarp = 1;
  });

  downloadBtn.addEventListener("mouseleave", () => {
    targetSpeed = 1;
    targetWarp = 0;
  });

  downloadBtn.addEventListener("mousedown", () => {
    targetSpeed = 0;
    targetWarp = 0;
  });

  downloadBtn.addEventListener("mouseup", () => {
    targetSpeed = 12;
    targetWarp = 1;
  });

  // ── Start ──────────────────────────────────────────────────────────
  window.addEventListener("resize", handleResize);
  init();
  draw();
})();


/* =====================================================================
   3. Scroll Hint Button
   =====================================================================
   A fixed "Scroll to learn more" pill at the bottom of the viewport.

   - Clicking it smooth-scrolls to the comparison section.
   - It auto-hides (via CSS opacity transition) once the user has
     scrolled past 30% of the viewport height.
   ===================================================================== */

/** @type {HTMLButtonElement} The scroll-hint pill button */
const scrollHintBtn = document.getElementById("scroll-hint");

// Click → smooth-scroll to the comparison section
scrollHintBtn.addEventListener("click", () => {
  document
    .getElementById("comparison")
    .scrollIntoView({ behavior: "smooth" });
});

// Auto-hide once the user has scrolled past 30% of the viewport.
// The `passive: true` option tells the browser this handler won't
// call preventDefault(), allowing scroll-performance optimisations.
window.addEventListener(
  "scroll",
  () => {
    const hasScrolledPast30Percent =
      window.scrollY > window.innerHeight * 0.3;
    scrollHintBtn.classList.toggle("hidden", hasScrolledPast30Percent);
  },
  { passive: true }
);


/* =====================================================================
   4. Footer Author Randomisation
   =====================================================================
   On every page load, the order of the author credit pills in the
   footer is shuffled using the Fisher–Yates algorithm.  This ensures
   fair, unbiased attribution — neither author is consistently listed
   first.
   ===================================================================== */

/** @type {HTMLElement} Container holding the author pill links */
const authorsContainer = document.querySelector(".footer-authors");

/** @type {Array<Element>} Snapshot of author elements to shuffle */
const authorElements = [...authorsContainer.children];

// Fisher–Yates (aka Knuth) shuffle — iterates backward through the
// array, swapping each element with a randomly-chosen earlier one.
for (let i = authorElements.length - 1; i > 0; i--) {
  const randomIndex = Math.floor(Math.random() * (i + 1));

  // Move the randomly-picked element to the end of the DOM order
  authorsContainer.appendChild(authorElements[randomIndex]);

  // Swap in the array to maintain correct indices for subsequent
  // iterations.
  [authorElements[i], authorElements[randomIndex]] = [
    authorElements[randomIndex],
    authorElements[i],
  ];
}


/* =====================================================================
   5. Comparison Animation Loop
   =====================================================================
   Continuously animates the two side-by-side desktop mock-ups in the
   "comparison" section to demonstrate the difference between stock
   macOS (slow slide) and Space Rabbit (instant switch).

   Each cycle:
     1. Show "CTRL" + "→/←" key indicators for both panels.
     2. "Before" panel: slide desktops over 800 ms with an easing
        curve, while a timer counts up from 0.0s to 0.8s.
     3. "After" panel: instantly cut to the new desktop (no animation),
        timer stays at 0.0s.
     4. Hold for 1.8 s so the viewer can see the result.
     5. Reset timers, hide key indicators, flip direction, and pause
        1.2 s before the next cycle.

   Direction alternates each cycle (right → left → right → …) so the
   viewer sees both "forward" and "back" switches.
   ===================================================================== */

(function initComparisonAnimation() {
  // ── Timing constants (milliseconds) ────────────────────────────────

  /** Duration of the macOS slide animation (how long the "before" panel
   *  takes to transition between desktops). */
  const SWITCH_DURATION_MS = 800;

  /** How long to hold the result visible after both panels have
   *  completed their transitions. */
  const HOLD_DURATION_MS = 1800;

  /** Pause at the start of each cycle (before the keys appear and the
   *  animation begins). */
  const PAUSE_DURATION_MS = 1200;

  /** Interval for the timer tick updates (50 ms ≈ 20 fps, plenty for
   *  a text counter). */
  const TIMER_TICK_MS = 50;

  // ── DOM element references ─────────────────────────────────────────

  // "Before" panel desktop spaces (the two sliding layers)
  const beforeSpaceA = document.querySelector("#mock-before .space-a");
  const beforeSpaceB = document.querySelector("#mock-before .space-b");

  // "After" panel desktop spaces (instant-cut, no animation)
  const afterSpaceA = document.querySelector("#mock-after .space-a");
  const afterSpaceB = document.querySelector("#mock-after .space-b");

  // Timer badges (show elapsed time during the animation)
  const timerBefore = document.getElementById("timer-before");
  const timerAfter = document.getElementById("timer-after");

  // Keyboard key indicator elements (CTRL and arrow keys)
  const keyBeforeCtrl  = document.getElementById("key-before-ctrl");
  const keyBeforeArrow = document.getElementById("key-before-arrow");
  const keyAfterCtrl   = document.getElementById("key-after-ctrl");
  const keyAfterArrow  = document.getElementById("key-after-arrow");

  // All four key elements grouped for convenience when showing/hiding
  const allKeyElements = [
    keyBeforeCtrl,
    keyBeforeArrow,
    keyAfterCtrl,
    keyAfterArrow,
  ];

  /** Tracks the current switch direction — alternates each cycle. */
  let isMovingRight = true;

  /**
   * Format a millisecond value as a "X.Xs" string.
   *
   * @param {number} ms - Elapsed milliseconds.
   * @returns {string} Formatted string, e.g. "0.8s".
   */
  function formatTime(ms) {
    return (ms / 1000).toFixed(1) + "s";
  }

  /**
   * Show all four keyboard key indicators and update the arrow
   * direction to match the current cycle.
   */
  function showKeyIndicators() {
    // Set the arrow symbol based on direction
    const arrowSymbol = isMovingRight ? "→" : "←";
    keyBeforeArrow.textContent = arrowSymbol;
    keyAfterArrow.textContent = arrowSymbol;

    // Reveal all keys (CSS transitions handle the pop-in animation)
    for (const key of allKeyElements) {
      key.classList.add("show");
    }
  }

  /**
   * Hide all four keyboard key indicators.
   */
  function hideKeyIndicators() {
    for (const key of allKeyElements) {
      key.classList.remove("show");
    }
  }

  /**
   * Run a single animation cycle.
   *
   * This function orchestrates one complete "before vs after" switch
   * demonstration, then schedules the next cycle after a pause.
   */
  function runCycle() {
    // ── Step 1: Show key indicators ────────────────────────────────
    showKeyIndicators();

    // ── Step 2: Set "before" panel starting positions ──────────────
    // Remove any existing CSS transition so we can snap to the start
    // position without animation.
    beforeSpaceA.style.transition = "none";
    beforeSpaceB.style.transition = "none";

    if (isMovingRight) {
      // Desktop 1 visible, Desktop 2 off-screen right
      beforeSpaceA.style.transform = "translateX(0)";
      beforeSpaceB.style.transform = "translateX(100%)";
    } else {
      // Desktop 2 visible, Desktop 1 off-screen left
      beforeSpaceB.style.transform = "translateX(0)";
      beforeSpaceA.style.transform = "translateX(-100%)";
    }

    // ── Step 3: Start the "before" timer ───────────────────────────
    // Counts up from 0.0s to 0.8s in sync with the slide animation.
    let elapsedMs = 0;

    const timerInterval = setInterval(() => {
      elapsedMs += TIMER_TICK_MS;

      // Clamp to SWITCH_DURATION_MS so we never show > 0.8s
      timerBefore.textContent = formatTime(
        Math.min(elapsedMs, SWITCH_DURATION_MS)
      );

      // Stop ticking once we've reached the switch duration
      if (elapsedMs >= SWITCH_DURATION_MS) {
        clearInterval(timerInterval);
      }
    }, TIMER_TICK_MS);

    // ── Step 4: Trigger the "before" slide animation ───────────────
    // We use a double-rAF to ensure the browser has committed the
    // "no transition" snap from step 2 before we re-enable the
    // transition and set the end position.  Without this, the
    // browser may batch both changes and skip the animation.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Re-enable CSS transitions with a material-design easing curve
        const transitionRule = `transform ${SWITCH_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        beforeSpaceA.style.transition = transitionRule;
        beforeSpaceB.style.transition = transitionRule;

        if (isMovingRight) {
          // Desktop 1 slides out left, Desktop 2 slides in from right
          beforeSpaceA.style.transform = "translateX(-100%)";
          beforeSpaceB.style.transform = "translateX(0)";
        } else {
          // Desktop 2 slides out right, Desktop 1 slides in from left
          beforeSpaceB.style.transform = "translateX(100%)";
          beforeSpaceA.style.transform = "translateX(0)";
        }
      });
    });

    // ── Step 5: Instant cut on the "after" panel ───────────────────
    // The whole point: Space Rabbit makes this switch instant.
    // Timer stays at 0.0s, and the desktop spaces snap to their
    // final positions with no transition.
    timerAfter.textContent = "0.0s";
    afterSpaceA.style.transition = "none";
    afterSpaceB.style.transition = "none";

    if (isMovingRight) {
      afterSpaceA.style.transform = "translateX(-100%)";
      afterSpaceB.style.transform = "translateX(0)";
    } else {
      afterSpaceB.style.transform = "translateX(100%)";
      afterSpaceA.style.transform = "translateX(0)";
    }

    // ── Step 6: After the hold period, reset and schedule next ─────
    setTimeout(() => {
      // Hide the keyboard key indicators
      hideKeyIndicators();

      // Flip direction for the next cycle
      isMovingRight = !isMovingRight;

      // Reset the "before" timer display
      timerBefore.textContent = "0.0s";

      // Schedule the next cycle after a brief pause
      setTimeout(runCycle, PAUSE_DURATION_MS);
    }, SWITCH_DURATION_MS + HOLD_DURATION_MS);
  }

  // ── Kick off the first cycle after an initial pause ────────────────
  setTimeout(runCycle, PAUSE_DURATION_MS);
})();
