import {
  DEFAULT_REPLICATOR_PRESET_ID,
  replicatorPresetById
} from "../simulation/replicatorPresets";
import type {
  RuntimeConfigUpdate,
  SimulationConfig
} from "../simulation/simulator";
import { numberFromInput } from "./dom";
import {
  parseRunParamsSource,
  runParamsToJson,
  runParamsToUrl,
  type RunParams
} from "./runParams";

export interface RuntimeControls {
  readConfig(): SimulationConfig;
  prepareSeedForReset(): void;
}

interface RuntimeControlRefs {
  mutationRateInput: HTMLInputElement;
  checkpointIntervalInput: HTMLInputElement;
  metricIntervalInput: HTMLInputElement;
  timeBudgetInput: HTMLInputElement;
  fixedSeedInput: HTMLInputElement;
  seedInput: HTMLInputElement;
  runParamsInput: HTMLTextAreaElement;
  runParamsFileInput: HTMLInputElement;
  applyRunParamsButton: HTMLButtonElement;
  uploadRunParamsButton: HTMLButtonElement;
  copyRunParamsJsonButton: HTMLButtonElement;
  copyRunParamsUrlButton: HTMLButtonElement;
  reproStatus: HTMLParagraphElement;
  resetDefaultsButton: HTMLButtonElement;
  replicatorPresetSelect: HTMLSelectElement;
  replicatorCountInput: HTMLInputElement;
}

interface RuntimeControlsOptions {
  config: SimulationConfig;
  defaults: SimulationConfig;
  refs: RuntimeControlRefs;
  initialFixedSeed?: boolean;
  initialStatus?: string | null;
  onUpdateConfig: (update: RuntimeConfigUpdate) => void;
  onDefaultsReset: () => void;
  onRunParamsApplied: () => void;
}

const MAX_SEED = 0xffff_ffff;

export function createRuntimeControls(
  options: RuntimeControlsOptions
): RuntimeControls {
  const {
    config,
    defaults,
    refs,
    initialFixedSeed = false,
    initialStatus = null,
    onUpdateConfig,
    onDefaultsReset,
    onRunParamsApplied
  } = options;
  const {
    mutationRateInput,
    checkpointIntervalInput,
    metricIntervalInput,
    timeBudgetInput,
    fixedSeedInput,
    seedInput,
    runParamsInput,
    runParamsFileInput,
    applyRunParamsButton,
    uploadRunParamsButton,
    copyRunParamsJsonButton,
    copyRunParamsUrlButton,
    reproStatus,
    resetDefaultsButton,
    replicatorPresetSelect,
    replicatorCountInput
  } = refs;
  let currentSeed = config.seed;
  fixedSeedInput.checked = initialFixedSeed;
  updateSeedStatus(initialStatus ?? undefined);

  mutationRateInput.addEventListener("change", () => {
    onUpdateConfig({
      mutationRate: numberFromInput(mutationRateInput, config.mutationRate)
    });
  });

  checkpointIntervalInput.addEventListener("change", () => {
    onUpdateConfig({
      checkpointInterval: numberFromInput(
        checkpointIntervalInput,
        config.checkpointInterval
      )
    });
  });

  metricIntervalInput.addEventListener("change", () => {
    onUpdateConfig({
      metricInterval: numberFromInput(metricIntervalInput, config.metricInterval)
    });
  });

  timeBudgetInput.addEventListener("change", () => {
    onUpdateConfig({
      timeBudgetMs: numberFromInput(timeBudgetInput, config.timeBudgetMs)
    });
  });

  fixedSeedInput.addEventListener("change", () => updateSeedStatus());

  seedInput.addEventListener("change", () => {
    const seed = seedFromInput(seedInput, currentSeed);
    seedInput.value = String(seed);
    if (fixedSeedInput.checked) {
      currentSeed = seed;
    }
    updateSeedStatus();
  });

  applyRunParamsButton.addEventListener("click", () => {
    applyRunParamsFromSource(runParamsInput.value, "Loaded run parameters.");
  });

  uploadRunParamsButton.addEventListener("click", () => {
    runParamsFileInput.click();
  });

  runParamsFileInput.addEventListener("change", async () => {
    const file = runParamsFileInput.files?.[0];
    if (!file) {
      return;
    }
    try {
      const source = await file.text();
      runParamsInput.value = source;
      applyRunParamsFromSource(source, `Uploaded ${file.name}.`);
    } catch {
      updateSeedStatus("Could not read that JSON file.");
    } finally {
      runParamsFileInput.value = "";
    }
  });

  copyRunParamsJsonButton.addEventListener("click", () => {
    copyRunParams(runParamsToJson(readConfig()), "Copied run JSON.");
  });

  copyRunParamsUrlButton.addEventListener("click", () => {
    copyRunParams(
      runParamsToUrl(readConfig(), globalThis.location.href),
      "Copied run URL."
    );
  });

  resetDefaultsButton.addEventListener("click", () => {
    mutationRateInput.value = String(defaults.mutationRate);
    checkpointIntervalInput.value = String(defaults.checkpointInterval);
    metricIntervalInput.value = String(defaults.metricInterval);
    timeBudgetInput.value = String(defaults.timeBudgetMs);
    fixedSeedInput.checked = false;
    currentSeed = defaults.seed;
    seedInput.value = String(defaults.seed);
    updateSeedStatus();
    replicatorPresetSelect.value = DEFAULT_REPLICATOR_PRESET_ID;
    replicatorCountInput.value = String(
      replicatorPresetById(DEFAULT_REPLICATOR_PRESET_ID).defaultCount
    );
    onDefaultsReset();
    onUpdateConfig({
      mutationRate: defaults.mutationRate,
      checkpointInterval: defaults.checkpointInterval,
      metricInterval: defaults.metricInterval,
      timeBudgetMs: defaults.timeBudgetMs
    });
  });

  function readConfig(): SimulationConfig {
    return {
      gridWidth: config.gridWidth,
      gridHeight: config.gridHeight,
      seed: fixedSeedInput.checked
        ? seedFromInput(seedInput, currentSeed)
        : currentSeed,
      mutationRate: numberFromInput(mutationRateInput, config.mutationRate),
      checkpointInterval: numberFromInput(
        checkpointIntervalInput,
        config.checkpointInterval
      ),
      metricInterval: numberFromInput(metricIntervalInput, config.metricInterval),
      timeBudgetMs: numberFromInput(timeBudgetInput, config.timeBudgetMs),
      maxInstructionReads: config.maxInstructionReads
    };
  }

  function prepareSeedForReset(): void {
    if (fixedSeedInput.checked) {
      currentSeed = seedFromInput(seedInput, currentSeed);
      seedInput.value = String(currentSeed);
    } else {
      currentSeed = randomSeed();
    }
    updateSeedStatus();
  }

  function applyRunParamsFromSource(source: string, successMessage: string): void {
    try {
      applyRunParams(parseRunParamsSource(source));
      updateSeedStatus(successMessage);
      onUpdateConfig(runtimeUpdateFromControls());
      onRunParamsApplied();
    } catch (caught) {
      updateSeedStatus(
        caught instanceof Error ? caught.message : "Could not load run parameters."
      );
    }
  }

  function applyRunParams(params: RunParams): void {
    if (params.seed !== undefined) {
      currentSeed = params.seed;
      seedInput.value = String(params.seed);
      fixedSeedInput.checked = params.fixedSeed ?? true;
    } else if (params.fixedSeed !== undefined) {
      fixedSeedInput.checked = params.fixedSeed;
    }
    if (params.mutationRate !== undefined) {
      mutationRateInput.value = String(params.mutationRate);
    }
    if (params.checkpointInterval !== undefined) {
      checkpointIntervalInput.value = String(params.checkpointInterval);
    }
    if (params.metricInterval !== undefined) {
      metricIntervalInput.value = String(params.metricInterval);
    }
    if (params.timeBudgetMs !== undefined) {
      timeBudgetInput.value = String(params.timeBudgetMs);
    }
  }

  function runtimeUpdateFromControls(): RuntimeConfigUpdate {
    return {
      mutationRate: numberFromInput(mutationRateInput, config.mutationRate),
      checkpointInterval: numberFromInput(
        checkpointIntervalInput,
        config.checkpointInterval
      ),
      metricInterval: numberFromInput(metricIntervalInput, config.metricInterval),
      timeBudgetMs: numberFromInput(timeBudgetInput, config.timeBudgetMs)
    };
  }

  function copyRunParams(text: string, successMessage: string): void {
    runParamsInput.value = text;
    void copyText(text)
      .then(() => updateSeedStatus(successMessage))
      .catch(() => updateSeedStatus("Generated text below; copy it manually."));
  }

  function updateSeedStatus(message?: string): void {
    if (message) {
      reproStatus.textContent = message;
      return;
    }
    if (fixedSeedInput.checked) {
      reproStatus.textContent = `Next reset will replay seed ${seedFromInput(
        seedInput,
        currentSeed
      )} with the current parameter values.`;
    } else {
      reproStatus.textContent =
        "Reset uses a fresh random seed unless fixed seed is enabled.";
    }
  }

  return {
    readConfig,
    prepareSeedForReset
  };
}

async function copyText(text: string): Promise<void> {
  if (globalThis.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(text);
    return;
  }
  throw new Error("Clipboard is unavailable.");
}

function seedFromInput(input: HTMLInputElement, fallback: number): number {
  const seed = Math.floor(numberFromInput(input, fallback));
  if (!Number.isFinite(seed)) {
    return fallback >>> 0;
  }
  return Math.min(MAX_SEED, Math.max(0, seed)) >>> 0;
}

function randomSeed(): number {
  const values = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
    return values[0];
  }
  return (Date.now() ^ Math.floor(Math.random() * 0x1_0000_0000)) >>> 0;
}
