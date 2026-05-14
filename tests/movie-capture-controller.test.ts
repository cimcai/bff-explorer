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
});

interface FakeInput extends HTMLInputElement {
  emit(type: string): void;
}

function setupController(): {
  controller: ReturnType<typeof createMovieCaptureController>;
  enabledInput: FakeInput;
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
  const statusElement = fakeStatusElement();
  const shareButton = {
    hidden: true,
    addEventListener: () => undefined
  } as unknown as HTMLButtonElement;

  return {
    controller: createMovieCaptureController({
      refs: {
        sourceCanvas,
        captureCanvas,
        enabledInput,
        status: statusElement,
        shareButton
      }
    }),
    enabledInput,
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
  const listeners = new Map<string, Array<EventListenerOrEventListenerObject>>();
  return {
    checked: false,
    disabled: false,
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
  } as FakeInput;
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
