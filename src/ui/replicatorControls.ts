import {
  DEFAULT_REPLICATOR_PRESET_ID,
  replicatorPresetById,
  replicatorPresetBytes
} from "../simulation/replicatorPresets";
import type { SimulationConfig, SimulationStatus } from "../simulation/simulator";
import type { WorkerOutMessage } from "../types";
import { encodeCellBytes } from "../simulation/cellEncoding";
import { clamp, numberFromInput } from "./dom";
import { drawProgramBytes } from "./programCanvas";

export interface ReplicatorControls {
  resetToDefault(): void;
  updateStatus(status: SimulationStatus): void;
  updateInjectionStatus(
    message: Extract<WorkerOutMessage, { type: "injectionComplete" }>
  ): void;
}

interface ReplicatorControlRefs {
  presetSelect: HTMLSelectElement;
  countInput: HTMLInputElement;
  previewCanvas: HTMLCanvasElement;
  description: HTMLParagraphElement;
  code: HTMLElement;
  injectButton: HTMLButtonElement;
  loadToLabButton: HTMLButtonElement;
  status: HTMLParagraphElement;
}

interface ReplicatorControlsOptions {
  config: SimulationConfig;
  refs: ReplicatorControlRefs;
  onInject: (presetId: string, bytes: Uint8Array, count: number) => void;
  onLoadToLab: (bytes: Uint8Array, presetName: string) => void;
}

export function createReplicatorControls(
  options: ReplicatorControlsOptions
): ReplicatorControls {
  const { config, refs, onInject, onLoadToLab } = options;
  const {
    presetSelect,
    countInput,
    previewCanvas,
    description,
    code,
    injectButton,
    loadToLabButton,
    status
  } = refs;
  let lastStatus: SimulationStatus | null = null;

  presetSelect.addEventListener("change", renderPreset);
  countInput.addEventListener("change", () => {
    countInput.value = String(readCount());
  });
  injectButton.addEventListener("click", () => {
    const preset = selectedPreset();
    const count = readCount();
    countInput.value = String(count);
    setStatus(
      `Injecting ${count.toLocaleString()} ${count === 1 ? "copy" : "copies"} of ${preset.name}...`
    );
    onInject(preset.id, replicatorPresetBytes(preset.id), count);
  });
  loadToLabButton.addEventListener("click", () => {
    const preset = selectedPreset();
    onLoadToLab(replicatorPresetBytes(preset.id), preset.name);
  });

  renderPreset();

  function resetToDefault(): void {
    presetSelect.value = DEFAULT_REPLICATOR_PRESET_ID;
    countInput.value = String(
      replicatorPresetById(DEFAULT_REPLICATOR_PRESET_ID).defaultCount
    );
    renderPreset();
    setStatus("Ready to inject.");
  }

  function updateStatus(statusUpdate: SimulationStatus): void {
    lastStatus = statusUpdate;
  }

  function updateInjectionStatus(
    message: Extract<WorkerOutMessage, { type: "injectionComplete" }>
  ): void {
    const preset = replicatorPresetById(message.presetId);
    if (message.error) {
      setStatus(message.error, true);
      return;
    }

    const copyText = message.insertedCount === 1 ? "copy" : "copies";
    setStatus(
      `Inserted ${message.insertedCount.toLocaleString()} ${copyText} of ${preset.name}.`
    );
  }

  function renderPreset(): void {
    const preset = selectedPreset();
    const bytes = replicatorPresetBytes(preset.id);
    description.textContent = preset.description;
    code.textContent = encodeCellBytes(bytes);
    drawProgramBytes(previewCanvas, bytes);
    injectButton.title = `Randomly insert ${preset.name} into the current frame`;
    loadToLabButton.title = `Copy ${preset.name} into the pair interaction lab`;
  }

  function selectedPreset() {
    return replicatorPresetById(presetSelect.value);
  }

  function readCount(): number {
    const fallback = selectedPreset().defaultCount;
    const maxCells =
      (lastStatus?.gridWidth ?? config.gridWidth) *
      (lastStatus?.gridHeight ?? config.gridHeight);
    return clamp(Math.floor(numberFromInput(countInput, fallback)), 1, maxCells);
  }

  function setStatus(text: string, error = false): void {
    status.textContent = text;
    status.classList.toggle("error", error);
    status.classList.toggle("success", !error);
  }

  return {
    resetToDefault,
    updateStatus,
    updateInjectionStatus
  };
}
