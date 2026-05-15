import {
  DEFAULT_REPLICATOR_PRESET_ID,
  replicatorPresetById
} from "../simulation/replicatorPresets";
import type {
  RuntimeConfigUpdate,
  SimulationConfig
} from "../simulation/simulator";
import { numberFromInput } from "./dom";

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
  loadObservedRunButton: HTMLButtonElement;
  reproStatus: HTMLParagraphElement;
  resetDefaultsButton: HTMLButtonElement;
  replicatorPresetSelect: HTMLSelectElement;
  replicatorCountInput: HTMLInputElement;
}

interface RuntimeControlsOptions {
  config: SimulationConfig;
  defaults: SimulationConfig;
  refs: RuntimeControlRefs;
  onUpdateConfig: (update: RuntimeConfigUpdate) => void;
  onDefaultsReset: () => void;
  onObservedRunLoad: () => void;
}

const OBSERVED_REPLICATION_RUN = {
  seed: 1,
  mutationRate: 1 / 8192,
  targetEpoch: 11008
} as const;

const MAX_SEED = 0xffff_ffff;

export function createRuntimeControls(
  options: RuntimeControlsOptions
): RuntimeControls {
  const {
    config,
    defaults,
    refs,
    onUpdateConfig,
    onDefaultsReset,
    onObservedRunLoad
  } = options;
  const {
    mutationRateInput,
    checkpointIntervalInput,
    metricIntervalInput,
    timeBudgetInput,
    fixedSeedInput,
    seedInput,
    loadObservedRunButton,
    reproStatus,
    resetDefaultsButton,
    replicatorPresetSelect,
    replicatorCountInput
  } = refs;
  let currentSeed = config.seed;

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

  loadObservedRunButton.addEventListener("click", () => {
    fixedSeedInput.checked = true;
    currentSeed = OBSERVED_REPLICATION_RUN.seed;
    seedInput.value = String(OBSERVED_REPLICATION_RUN.seed);
    mutationRateInput.value = String(OBSERVED_REPLICATION_RUN.mutationRate);
    updateSeedStatus(
      `Loaded observed hit: seed ${OBSERVED_REPLICATION_RUN.seed}, mutation ${OBSERVED_REPLICATION_RUN.mutationRate}. Watch around epoch ${OBSERVED_REPLICATION_RUN.targetEpoch}.`
    );
    onUpdateConfig({
      mutationRate: OBSERVED_REPLICATION_RUN.mutationRate
    });
    onObservedRunLoad();
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
