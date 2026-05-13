import { clamp } from "./dom";

export function bindTooltips(
  tooltipLayer: HTMLDivElement,
  root: ParentNode = document
): void {
  root.querySelectorAll<HTMLElement>("[data-tip]").forEach((element) => {
    element.addEventListener("mouseenter", () => showTooltip(tooltipLayer, element));
    element.addEventListener("focus", () => showTooltip(tooltipLayer, element));
    element.addEventListener("mouseleave", () => hideTooltip(tooltipLayer));
    element.addEventListener("blur", () => hideTooltip(tooltipLayer));
  });
  window.addEventListener("scroll", () => hideTooltip(tooltipLayer), {
    passive: true
  });
  window.addEventListener("resize", () => hideTooltip(tooltipLayer));
}

function showTooltip(tooltipLayer: HTMLDivElement, anchor: HTMLElement): void {
  const text = anchor.dataset.tip;
  if (!text) {
    return;
  }
  tooltipLayer.textContent = text;
  tooltipLayer.hidden = false;
  tooltipLayer.style.left = "0px";
  tooltipLayer.style.top = "0px";

  const anchorRect = anchor.getBoundingClientRect();
  const tooltipRect = tooltipLayer.getBoundingClientRect();
  const margin = 12;
  const gap = 8;
  const preferredTop = anchorRect.top - tooltipRect.height - gap;
  const top =
    preferredTop >= margin
      ? preferredTop
      : Math.min(
          window.innerHeight - tooltipRect.height - margin,
          anchorRect.bottom + gap
        );
  const left = clamp(
    anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2,
    margin,
    window.innerWidth - tooltipRect.width - margin
  );

  tooltipLayer.style.left = `${left}px`;
  tooltipLayer.style.top = `${Math.max(margin, top)}px`;
}

function hideTooltip(tooltipLayer: HTMLDivElement): void {
  tooltipLayer.hidden = true;
}
