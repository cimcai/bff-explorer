import { programToGlyphs, type ProgramSummary } from "../simulation/programSummary";
import {
  clearCanvas,
  drawProgramCanvas,
  shortProgramId
} from "./programCanvas";
import { clamp } from "./dom";

export interface ProgramBrowser {
  selectedProgram(): ProgramSummary | null;
  update(programs: readonly ProgramSummary[]): void;
}

interface ProgramBrowserRefs {
  programList: HTMLDivElement;
  detailCanvas: HTMLCanvasElement;
  detailTitle: HTMLHeadingElement;
  detailStats: HTMLParagraphElement;
  detailCode: HTMLElement;
}

export function createProgramBrowser(refs: ProgramBrowserRefs): ProgramBrowser {
  const { programList, detailCanvas, detailTitle, detailStats, detailCode } =
    refs;
  let visiblePrograms: ProgramSummary[] = [];
  let selectedProgramIndex = 0;

  programList.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-program-index]"
    );
    if (!button) {
      return;
    }
    selectedProgramIndex = Number(button.dataset.programIndex ?? 0);
    render();
  });

  function selectedProgram(): ProgramSummary | null {
    return visiblePrograms[selectedProgramIndex] ?? null;
  }

  function update(programs: readonly ProgramSummary[]): void {
    visiblePrograms = programs
      .filter((program) => program.count > 1)
      .map((program) => ({
        ...program,
        bytes: [...program.bytes]
      }));
    selectedProgramIndex = clamp(
      selectedProgramIndex,
      0,
      Math.max(0, visiblePrograms.length - 1)
    );
    render();
  }

  function render(): void {
    if (visiblePrograms.length === 0) {
      programList.innerHTML = `<p class="empty-programs">No repeated programs yet.</p>`;
      detailTitle.textContent = "No repeated program yet";
      detailStats.textContent =
        "Repeated 64-byte tapes will appear here once a program occupies more than one cell.";
      detailCode.textContent = "";
      clearCanvas(detailCanvas);
      return;
    }

    programList.innerHTML = visiblePrograms
      .map(
        (program, index) => `
          <button class="program-row ${index === selectedProgramIndex ? "selected" : ""}" type="button" data-program-index="${index}" title="Visualize repeated program ${index + 1}">
            <canvas width="64" height="64" aria-hidden="true"></canvas>
            <span class="program-summary">
              <strong>#${index + 1} ${shortProgramId(program.id)}</strong>
              <span>${program.count.toLocaleString()} cells · ${(program.fraction * 100).toFixed(2)}%</span>
              <span>${program.activeBytes}/64 executable · ${program.nullBytes} null bytes</span>
            </span>
          </button>
        `
      )
      .join("");

    programList
      .querySelectorAll<HTMLCanvasElement>(".program-row canvas")
      .forEach((programCanvas, index) =>
        drawProgramCanvas(programCanvas, visiblePrograms[index])
      );
    renderProgramDetail(visiblePrograms[selectedProgramIndex]);
  }

  function renderProgramDetail(program: ProgramSummary): void {
    drawProgramCanvas(detailCanvas, program);
    detailTitle.textContent = `Program ${shortProgramId(program.id)}`;
    detailStats.textContent = `${program.count.toLocaleString()} cells (${(program.fraction * 100).toFixed(2)}%) · ${program.activeBytes}/64 executable bytes · ${program.nullBytes} null bytes · ${program.byteEntropyBpb.toFixed(2)} bits per byte`;
    detailCode.textContent = programToGlyphs(program.bytes);
  }

  return {
    selectedProgram,
    update
  };
}
