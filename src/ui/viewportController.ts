import type { SimulationStatus } from "../simulation/simulator";
import { clamp } from "./dom";

export interface ViewportController {
  readonly canUseOffscreen: boolean;
  transferToOffscreen(): OffscreenCanvas;
  drawFallbackFrame(width: number, height: number, buffer: ArrayBuffer): void;
  resetFit(): void;
  fitSoon(): void;
  updateCanvasSize(status: SimulationStatus): void;
}

interface ViewportControllerOptions {
  canvas: HTMLCanvasElement;
  viewport: HTMLDivElement;
  fullscreenButton: HTMLButtonElement;
  overlayElements: readonly (HTMLElement | null)[];
  initialRenderWidth: number;
  initialRenderHeight: number;
}

export function createViewportController(
  options: ViewportControllerOptions
): ViewportController {
  const {
    canvas,
    viewport,
    fullscreenButton,
    overlayElements,
    initialRenderWidth,
    initialRenderHeight
  } = options;
  const canUseOffscreen =
    typeof (
      canvas as HTMLCanvasElement & {
        transferControlToOffscreen?: unknown;
      }
    ).transferControlToOffscreen === "function";
  const fallbackContext = canUseOffscreen
    ? null
    : canvas.getContext("2d", { alpha: false });

  let renderWidth = initialRenderWidth;
  let renderHeight = initialRenderHeight;
  let viewportScale = 1;
  let viewportOffsetX = 0;
  let viewportOffsetY = 0;
  let fitInitialized = false;
  let isPanning = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  for (const overlay of overlayElements) {
    overlay?.addEventListener("pointerdown", stopViewportGesture);
    overlay?.addEventListener("pointermove", stopViewportGesture);
    overlay?.addEventListener("pointerup", stopViewportGesture);
    overlay?.addEventListener("click", stopViewportGesture);
    overlay?.addEventListener("wheel", stopViewportGesture, { passive: false });
  }

  fullscreenButton.addEventListener("click", async () => {
    await toggleFullscreen();
    fitSoon();
  });
  document.addEventListener("fullscreenchange", () => {
    viewport.classList.toggle("fullscreen-fallback", false);
    updateFullscreenButton();
    fitSoon();
  });

  viewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.001);
      zoomAt(event.clientX, event.clientY, factor);
    },
    { passive: false }
  );

  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    isPanning = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("panning");
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!isPanning) {
      return;
    }
    viewportOffsetX += event.clientX - lastPointerX;
    viewportOffsetY += event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    applyViewportTransform();
  });

  viewport.addEventListener("pointerup", (event) => {
    isPanning = false;
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    viewport.classList.remove("panning");
  });

  viewport.addEventListener("pointercancel", () => {
    isPanning = false;
    viewport.classList.remove("panning");
  });
  viewport.addEventListener("dblclick", fitCanvas);
  window.addEventListener("resize", () => {
    if (!fitInitialized) {
      return;
    }
    fitSoon();
  });

  function transferToOffscreen(): OffscreenCanvas {
    return (
      canvas as HTMLCanvasElement & {
        transferControlToOffscreen: () => OffscreenCanvas;
      }
    ).transferControlToOffscreen();
  }

  function drawFallbackFrame(
    width: number,
    height: number,
    buffer: ArrayBuffer
  ): void {
    if (!fallbackContext) {
      return;
    }
    canvas.width = width;
    canvas.height = height;
    const data = new Uint8ClampedArray(buffer);
    fallbackContext.putImageData(new ImageData(data, width, height), 0, 0);
  }

  function updateCanvasSize(status: SimulationStatus): void {
    renderWidth = status.renderWidth;
    renderHeight = status.renderHeight;
    canvas.style.width = `${renderWidth}px`;
    canvas.style.height = `${renderHeight}px`;
    if (!fitInitialized) {
      fitCanvas();
      fitInitialized = true;
    } else {
      applyViewportTransform();
    }
  }

  function resetFit(): void {
    fitInitialized = false;
  }

  function fitCanvas(): void {
    const rect = viewport.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      renderWidth <= 0 ||
      renderHeight <= 0
    ) {
      return;
    }
    viewportScale = fittedViewportScale(rect);
    centerCanvas();
    applyViewportTransform();
  }

  function fitSoon(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(fitCanvas);
    });
  }

  function centerCanvas(): void {
    const rect = viewport.getBoundingClientRect();
    viewportOffsetX = (rect.width - renderWidth * viewportScale) / 2;
    viewportOffsetY = (rect.height - renderHeight * viewportScale) / 2;
  }

  function zoomAt(clientX: number, clientY: number, factor: number): void {
    const rect = viewport.getBoundingClientRect();
    if (renderWidth <= 0 || renderHeight <= 0) {
      return;
    }
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const worldX = (localX - viewportOffsetX) / viewportScale;
    const worldY = (localY - viewportOffsetY) / viewportScale;
    const fitScale = fittedViewportScale(rect);
    viewportScale = clamp(viewportScale * factor, fitScale, 12);
    viewportOffsetX = localX - worldX * viewportScale;
    viewportOffsetY = localY - worldY * viewportScale;
    applyViewportTransform();
  }

  function fittedViewportScale(rect: DOMRect): number {
    return Math.min(rect.width / renderWidth, rect.height / renderHeight) * 0.98;
  }

  function applyViewportTransform(): void {
    const rect = viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const scaledWidth = renderWidth * viewportScale;
    const scaledHeight = renderHeight * viewportScale;

    if (scaledWidth <= rect.width) {
      viewportOffsetX = (rect.width - scaledWidth) / 2;
    } else {
      viewportOffsetX = clamp(viewportOffsetX, rect.width - scaledWidth, 0);
    }
    if (scaledHeight <= rect.height) {
      viewportOffsetY = (rect.height - scaledHeight) / 2;
    } else {
      viewportOffsetY = clamp(viewportOffsetY, rect.height - scaledHeight, 0);
    }

    canvas.style.transform = `translate(${viewportOffsetX}px, ${viewportOffsetY}px) scale(${viewportScale})`;
  }

  async function toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement === viewport) {
      await document.exitFullscreen();
      updateFullscreenButton();
      return;
    }

    if (viewport.classList.contains("fullscreen-fallback")) {
      viewport.classList.remove("fullscreen-fallback");
      document.body.classList.remove("viewport-fullscreen-active");
      updateFullscreenButton();
      return;
    }

    try {
      if (viewport.requestFullscreen) {
        await viewport.requestFullscreen();
      } else {
        enableFullscreenFallback();
      }
    } catch {
      enableFullscreenFallback();
    }
    updateFullscreenButton();
  }

  function enableFullscreenFallback(): void {
    viewport.classList.add("fullscreen-fallback");
    document.body.classList.add("viewport-fullscreen-active");
  }

  function updateFullscreenButton(): void {
    const active =
      document.fullscreenElement === viewport ||
      viewport.classList.contains("fullscreen-fallback");
    fullscreenButton.textContent = active ? "Exit" : "Full";
    fullscreenButton.title = active ? "Exit fullscreen" : "Fullscreen";
    fullscreenButton.dataset.tip = active ? "Exit fullscreen" : "Enter fullscreen";
    fullscreenButton.setAttribute(
      "aria-label",
      active ? "Exit fullscreen" : "Enter fullscreen"
    );
  }

  function stopViewportGesture(event: Event): void {
    event.stopPropagation();
  }

  return {
    canUseOffscreen,
    transferToOffscreen,
    drawFallbackFrame,
    resetFit,
    fitSoon,
    updateCanvasSize
  };
}
