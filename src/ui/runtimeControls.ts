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
  randomizeSeed(): void;
}

interface RuntimeControlRefs {
  mutationRateInput: HTMLInputElement;
  checkpointIntervalInput: HTMLInputElement;
  metricIntervalInput: HTMLInputElement;
  timeBudgetInput: HTMLInputElement;
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
}

export function createRuntimeControls(
  options: RuntimeControlsOptions
): RuntimeControls {
  const { config, defaults, refs, onUpdateConfig, onDefaultsReset } = options;
  const {
    mutationRateInput,
    checkpointIntervalInput,
    metricIntervalInput,
    timeBudgetInput,
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

  resetDefaultsButton.addEventListener("click", () => {
    mutationRateInput.value = String(defaults.mutationRate);
    checkpointIntervalInput.value = String(defaults.checkpointInterval);
    metricIntervalInput.value = String(defaults.metricInterval);
    timeBudgetInput.value = String(defaults.timeBudgetMs);
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
      seed: currentSeed,
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

  function randomizeSeed(): void {
    currentSeed = randomSeed();
  }

  return {
    readConfig,
    randomizeSeed
  };
}

function randomSeed(): number {
  const values = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
    return values[0];
  }
  return (Date.now() ^ Math.floor(Math.random() * 0x1_0000_0000)) >>> 0;
}
