import { afterEach, describe, expect, it, vi } from "vitest";
import { createMovieCaptureController } from "../src/ui/movieCapture/movieCaptureController";
import type { MetricSnapshot } from "../src/simulation/metrics";
import type { ProgramSummary } from "../src/simulation/programSummary";
import type { SimulationStatus } from "../src/simulation/simulator";

describe("movie capture controller", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("triggers capture when an injected run makes a strong metric jump", () => {
    installBrowserMediaFakes();
    const { controller, enabledInput, statusElement } = setupController();

    enabledInput.checked = true;
    enabledInput.emit("change");
    expect(statusElement.textContent).toContain("Watching WebM");

    controller.noteInjection(64);
    controller.update(status(0, metric(0, 0.003), [program("preset", 64)]));
    expect(statusElement.textContent).toContain("Watching WebM");

    controller.update(status(256, metric(256, 3.2), [
      program("preset", 64)
    ]));

    expect(statusElement.textContent).toContain("Replication detected");
  });

  it("lets the user manually mark the current epoch for movie saving", () => {
    installBrowserMediaFakes();
    const { controller, enabledInput, manualButton, statusElement } =
      setupController();

    controller.update(status(42, metric(42, 0.2), [program("candidate", 12)]));
    manualButton.emit("click");

    expect(enabledInput.checked).toBe(true);
    expect(manualButton.disabled).toBe(true);
    expect(statusElement.textContent).toContain(
      "Manual movie capture at epoch 42"
    );
  });
});

interface FakeInput extends HTMLInputElement {
  emit(type: string): void;
}

interface FakeButton extends HTMLButtonElement {
  emit(type: string): void;
}

function setupController(): {
  controller: ReturnType<typeof createMovieCaptureController>;
  enabledInput: FakeInput;
  manualButton: FakeButton;
  statusElement: HTMLParagraphElement;
} {
  const sourceCanvas = {} as HTMLCanvasElement;
  const captureCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      imageSmoothingEnabled: false,
      fillStyle: "",
      fillRect: () => undefined,
      drawImage: () => undefined
    }),
    captureStream: () => ({
      getTracks: () => [{ stop: () => undefined }]
    })
  } as unknown as HTMLCanvasElement;
  const enabledInput = fakeInput();
  const manualButton = fakeButton();
  const statusElement = fakeStatusElement();
  const shareButton = fakeButton();

  return {
    controller: createMovieCaptureController({
      refs: {
        sourceCanvas,
        captureCanvas,
        enabledInput,
        status: statusElement,
        manualButton,
        shareButton
      }
    }),
    enabledInput,
    manualButton,
    statusElement
  };
}

function installBrowserMediaFakes(): void {
  class FakeMediaRecorder extends EventTarget {
    static isTypeSupported(mimeType: string): boolean {
      return mimeType.startsWith("video/webm");
    }

    state: RecordingState = "inactive";

    start(): void {
      this.state = "recording";
    }

    requestData(): void {
      // The trigger test does not run through final save.
    }

    stop(): void {
      this.state = "inactive";
      this.dispatchEvent(new Event("stop"));
    }
  }

  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
}

function fakeInput(): FakeInput {
  return fakeEventTarget({ checked: false, disabled: false }) as FakeInput;
}

function fakeButton(): FakeButton {
  return fakeEventTarget({ disabled: false, hidden: false }) as FakeButton;
}

function fakeEventTarget<T extends object>(
  props: T
): T & { emit(type: string): void } {
  const listeners = new Map<string, Array<EventListenerOrEventListenerObject>>();
  return {
    ...props,
    addEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject
    ) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    emit: (type: string) => {
      for (const listener of listeners.get(type) ?? []) {
        if (typeof listener === "function") {
          listener(new Event(type));
        } else {
          listener.handleEvent(new Event(type));
        }
      }
    }
  };
}

function fakeStatusElement(): HTMLParagraphElement {
  return {
    textContent: "",
    classList: {
      toggle: () => false
    }
  } as unknown as HTMLParagraphElement;
}

function status(
  epoch: number,
  latestMetric: MetricSnapshot,
  topPrograms: ProgramSummary[]
): SimulationStatus {
  return {
    running: true,
    epoch,
    gridWidth: 20,
    gridHeight: 20,
    renderWidth: 160,
    renderHeight: 160,
    epochsPerSecond: 100,
    renderFps: 60,
    pairsPerEpoch: 100,
    avgInstructionReadsPerPair: 1,
    activeOpsPerEpoch: 10,
    checkpoints: [],
    isViewingCheckpoint: false,
    activeCheckpointId: null,
    latestMetric,
    metricHistory: [latestMetric],
    topPrograms
  };
}

function metric(epoch: number, structureScore: number): MetricSnapshot {
  return {
    epoch,
    byteEntropyBpb: 7.8,
    compressedBpb: 7.7,
    structureScore,
    compressionGain: structureScore,
    activeInstructionFraction: 0.04,
    instructionEnrichmentScore: 0,
    dominantProgramFraction: 0.01,
    uniqueProgramFraction: 0.99,
    phaseTransitionScore: Math.max(0, structureScore - 0.003),
    phaseTransitionDetected: structureScore > 0.5
  };
}

function program(id: string, count: number): ProgramSummary {
  return {
    id,
    count,
    fraction: count / 400,
    activeBytes: 8,
    nullBytes: 0,
    byteEntropyBpb: 2,
    bytes: new Array(64).fill(43)
  };
}
