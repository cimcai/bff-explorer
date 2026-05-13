import type {
  CheckpointSummary,
  SimulationStatus
} from "../simulation/simulator";
import { numberFromInput } from "./dom";

export interface CheckpointController {
  acceptsPreview(requestId: number): boolean;
  update(status: SimulationStatus): void;
}

interface CheckpointControllerOptions {
  checkpointScrubber: HTMLInputElement;
  checkpointLabel: HTMLDivElement;
  checkpointEpochLabel: HTMLDivElement;
  checkpointLatestButton: HTMLButtonElement;
  onPreviewCheckpoint: (checkpointId: number, requestId: number) => void;
  onShowLive: () => void;
}

export function createCheckpointController(
  options: CheckpointControllerOptions
): CheckpointController {
  const {
    checkpointScrubber,
    checkpointLabel,
    checkpointEpochLabel,
    checkpointLatestButton,
    onPreviewCheckpoint,
    onShowLive
  } = options;
  let checkpoints: CheckpointSummary[] = [];
  let latestPreviewRequestId = 0;
  let pendingCheckpointId: number | null = null;
  let pendingPreviewFrame: number | null = null;
  let followLatestCheckpointOnNextStatus = false;

  checkpointScrubber.addEventListener("input", () => {
    const checkpoint =
      checkpoints[Math.floor(numberFromInput(checkpointScrubber, 0))];
    if (!checkpoint) {
      return;
    }
    previewCheckpoint(checkpoint.id);
  });

  checkpointLatestButton.addEventListener("click", () => {
    followLatestCheckpointOnNextStatus = true;
    onShowLive();
  });

  function acceptsPreview(requestId: number): boolean {
    return requestId === latestPreviewRequestId;
  }

  function update(status: SimulationStatus): void {
    const oldMax = Number(checkpointScrubber.max);
    const oldValue = Number(checkpointScrubber.value);
    const shouldFollowLatest = status.running && oldValue === oldMax;
    checkpoints = status.checkpoints;
    const newMax = Math.max(0, checkpoints.length - 1);
    checkpointScrubber.max = String(newMax);

    const activeIndex = status.activeCheckpointId
      ? checkpoints.findIndex(
          (checkpoint) => checkpoint.id === status.activeCheckpointId
        )
      : -1;
    if (
      followLatestCheckpointOnNextStatus ||
      shouldFollowLatest ||
      Number(checkpointScrubber.value) > newMax
    ) {
      checkpointScrubber.value = String(newMax);
    } else if (status.isViewingCheckpoint && activeIndex >= 0) {
      checkpointScrubber.value = String(activeIndex);
    }
    followLatestCheckpointOnNextStatus = false;

    const selectedIndex = Number(checkpointScrubber.value);
    const selected = checkpoints[selectedIndex] ?? checkpoints.at(-1);
    checkpointLabel.textContent = selected
      ? `Checkpoint ${selectedIndex + 1}/${checkpoints.length}`
      : "Checkpoint 0/0";
    checkpointEpochLabel.textContent = `Epoch: ${status.epoch.toLocaleString()}`;
    checkpointLatestButton.disabled =
      checkpoints.length === 0 ||
      (!status.isViewingCheckpoint && selectedIndex >= newMax);
  }

  function previewCheckpoint(checkpointId: number): void {
    pendingCheckpointId = checkpointId;
    if (pendingPreviewFrame !== null) {
      return;
    }
    pendingPreviewFrame = requestAnimationFrame(() => {
      pendingPreviewFrame = null;
      if (pendingCheckpointId === null) {
        return;
      }
      latestPreviewRequestId += 1;
      onPreviewCheckpoint(pendingCheckpointId, latestPreviewRequestId);
    });
  }

  return {
    acceptsPreview,
    update
  };
}
