import {
  encodeCellBytes,
  parseCellInput,
  type ParsedCellInput
} from "../simulation/cellEncoding";
import { DEFAULT_MAX_INSTRUCTION_READS } from "../simulation/constants";
import { evaluatePairInteraction } from "../simulation/interaction";
import { programToGlyphs, type ProgramSummary } from "../simulation/programSummary";
import { clamp, numberFromInput } from "./dom";
import { clearCanvas, drawProgramBytes, shortProgramId } from "./programCanvas";

export interface InteractionLab {
  loadReplicator(bytes: Uint8Array, presetName: string): void;
}

interface InteractionLabRefs {
  cellA: HTMLTextAreaElement;
  cellB: HTMLTextAreaElement;
  maxReads: HTMLInputElement;
  evaluateButton: HTMLButtonElement;
  loadTopProgramAButton: HTMLButtonElement;
  loadTopProgramBButton: HTMLButtonElement;
  zeroCellsButton: HTMLButtonElement;
  status: HTMLParagraphElement;
  beforeA: HTMLCanvasElement;
  beforeB: HTMLCanvasElement;
  afterA: HTMLCanvasElement;
  afterB: HTMLCanvasElement;
  changeA: HTMLSpanElement;
  changeB: HTMLSpanElement;
  statsA: HTMLParagraphElement;
  statsB: HTMLParagraphElement;
  outputA: HTMLElement;
  outputB: HTMLElement;
}

interface InteractionLabOptions {
  refs: InteractionLabRefs;
  selectedProgram: () => ProgramSummary | null;
}

export function createInteractionLab(
  options: InteractionLabOptions
): InteractionLab {
  const { refs, selectedProgram } = options;
  const {
    cellA,
    cellB,
    maxReads,
    evaluateButton,
    loadTopProgramAButton,
    loadTopProgramBButton,
    zeroCellsButton,
    status,
    beforeA,
    beforeB,
    afterA,
    afterB,
    changeA,
    changeB,
    statsA,
    statsB,
    outputA,
    outputB
  } = refs;

  for (const cellInput of [cellA, cellB]) {
    cellInput.addEventListener("input", () => {
      updatePreview();
      clearOutputs();
    });
  }

  maxReads.addEventListener("change", () => {
    maxReads.value = String(readMaxReads());
  });
  evaluateButton.addEventListener("click", evaluate);
  loadTopProgramAButton.addEventListener("click", () =>
    loadSelectedProgramInto(cellA)
  );
  loadTopProgramBButton.addEventListener("click", () =>
    loadSelectedProgramInto(cellB)
  );
  zeroCellsButton.addEventListener("click", () => {
    cellA.value = "";
    cellB.value = "";
    updatePreview();
    clearOutputs();
  });

  updatePreview();
  evaluate();

  function loadReplicator(bytes: Uint8Array, presetName: string): void {
    cellA.value = encodeCellBytes(bytes);
    cellB.value = "";
    updatePreview();
    evaluate();
    status.textContent = `Loaded ${presetName} into Cell A and evaluated it against an all-null Cell B.`;
  }

  function updatePreview(): boolean {
    const parsedA = parseCellInput(cellA.value);
    const parsedB = parseCellInput(cellB.value);
    drawProgramBytes(beforeA, parsedA.bytes);
    drawProgramBytes(beforeB, parsedB.bytes);

    const messages = inputMessages(parsedA, parsedB);
    const hasError = parsedA.error !== null || parsedB.error !== null;
    status.classList.toggle("error", hasError);
    status.textContent =
      messages.length > 0
        ? messages.join(" ")
        : `Ready: Cell A decodes to ${formatByteCount(parsedA.decodedByteLength)}, Cell B decodes to ${formatByteCount(parsedB.decodedByteLength)}.`;
    return !hasError;
  }

  function evaluate(): void {
    const parsedA = parseCellInput(cellA.value);
    const parsedB = parseCellInput(cellB.value);
    drawProgramBytes(beforeA, parsedA.bytes);
    drawProgramBytes(beforeB, parsedB.bytes);

    if (parsedA.error || parsedB.error) {
      clearOutputs();
      updatePreview();
      return;
    }

    const maxReadCount = readMaxReads();
    maxReads.value = String(maxReadCount);
    const result = evaluatePairInteraction(
      parsedA.bytes,
      parsedB.bytes,
      maxReadCount
    );
    drawProgramBytes(afterA, result.afterA);
    drawProgramBytes(afterB, result.afterB);

    changeA.textContent = formatChangeCount(result.changedA);
    changeB.textContent = formatChangeCount(result.changedB);
    statsA.textContent = `${formatByteCount(parsedA.decodedByteLength)} input, ${formatChangeCount(result.changedA)} after the interaction.`;
    statsB.textContent = `${formatByteCount(parsedB.decodedByteLength)} input, ${formatChangeCount(result.changedB)} after the interaction.`;
    outputA.textContent = programToGlyphs(Array.from(result.afterA));
    outputB.textContent = programToGlyphs(Array.from(result.afterB));

    const warnings = inputMessages(parsedA, parsedB);
    const haltText = result.haltedByStepLimit
      ? "stopped at the instruction cap"
      : "halted at the edge of the 128-byte pair buffer";
    status.classList.remove("error");
    status.textContent = [
      `${result.instructionReads.toLocaleString()} reads`,
      `${result.activeOps.toLocaleString()} active operations`,
      haltText,
      "no random mutation applied",
      ...warnings
    ].join(" · ");
  }

  function clearOutputs(): void {
    clearCanvas(afterA);
    clearCanvas(afterB);
    changeA.textContent = "0 changes";
    changeB.textContent = "0 changes";
    statsA.textContent = "Awaiting evaluation.";
    statsB.textContent = "Awaiting evaluation.";
    outputA.textContent = "";
    outputB.textContent = "";
  }

  function loadSelectedProgramInto(input: HTMLTextAreaElement): void {
    const program = selectedProgram();
    if (!program) {
      status.classList.remove("error");
      status.textContent =
        "No repeated program is available yet; let the metric sampler run or inject a preset.";
      return;
    }

    input.value = encodeCellBytes(program.bytes);
    updatePreview();
    clearOutputs();
    const cellName = input === cellA ? "Cell A" : "Cell B";
    status.textContent = `Copied repeated program ${shortProgramId(program.id)} into ${cellName}.`;
  }

  function readMaxReads(): number {
    const value = Math.floor(numberFromInput(maxReads, DEFAULT_MAX_INSTRUCTION_READS));
    return clamp(value, 1, DEFAULT_MAX_INSTRUCTION_READS);
  }

  return {
    loadReplicator
  };
}

function inputMessages(
  cellA: ParsedCellInput,
  cellB: ParsedCellInput
): string[] {
  const messages: string[] = [];
  if (cellA.error) {
    messages.push(`Cell A: ${cellA.error}`);
  }
  if (cellB.error) {
    messages.push(`Cell B: ${cellB.error}`);
  }
  if (cellA.truncated) {
    messages.push("Cell A decoded past 64 bytes and was truncated.");
  }
  if (cellB.truncated) {
    messages.push("Cell B decoded past 64 bytes and was truncated.");
  }
  return messages;
}

function formatByteCount(count: number): string {
  return `${count.toLocaleString()} decoded ${count === 1 ? "byte" : "bytes"}`;
}

function formatChangeCount(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "change" : "changes"}`;
}
