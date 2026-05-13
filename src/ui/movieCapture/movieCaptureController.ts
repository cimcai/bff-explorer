import { fixWebmDuration } from "@fix-webm-duration/fix";
import { ReplicationDetector } from "../../simulation/replicationDetector";
import type { ReplicationDetection } from "../../simulation/replicationDetector";
import type { SimulationStatus } from "../../simulation/simulator";
import { RollingCaptureBuffer } from "./captureBuffer";
import {
  MOVIE_CAPTURE_FPS,
  MOVIE_CAPTURE_HEIGHT,
  MOVIE_CAPTURE_WIDTH,
  MOVIE_POST_ROLL_MS,
  MOVIE_PRE_ROLL_MS,
  MOVIE_TIMESLICE_MS,
  mediaRecorderOptions,
  preferredVideoMimeType,
  videoExtension
} from "./mediaSettings";

export interface MovieCaptureController {
  update(status: SimulationStatus): void;
  noteInjection(insertedCount: number): void;
  resetRun(): void;
  stop(): void;
}

interface MovieCaptureRefs {
  sourceCanvas: HTMLCanvasElement;
  captureCanvas: HTMLCanvasElement;
  enabledInput: HTMLInputElement;
  status: HTMLParagraphElement;
  shareButton: HTMLButtonElement;
}

interface MovieCaptureControllerOptions {
  refs: MovieCaptureRefs;
}

type CaptureState =
  | "off"
  | "watching"
  | "triggered"
  | "saving"
  | "saved"
  | "error";

export function createMovieCaptureController(
  options: MovieCaptureControllerOptions
): MovieCaptureController {
  const { refs } = options;
  const {
    sourceCanvas,
    captureCanvas,
    enabledInput,
    status,
    shareButton
  } = refs;
  const detector = new ReplicationDetector();
  const buffer = new RollingCaptureBuffer();
  const captureContext = captureCanvas.getContext("2d", { alpha: false });
  let state: CaptureState = "off";
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let drawFrameId = 0;
  let postRollUntil = 0;
  let detection: ReplicationDetection | null = null;
  let lastStatus: SimulationStatus | null = null;
  let lastFile: File | null = null;
  let mimeType = "";

  captureCanvas.width = MOVIE_CAPTURE_WIDTH;
  captureCanvas.height = MOVIE_CAPTURE_HEIGHT;
  shareButton.hidden = true;

  if (!canCapture()) {
    enabledInput.disabled = true;
    setStatus("error", "Movie capture unavailable in this browser.");
  } else {
    setStatus("off", "Movie capture off.");
  }

  enabledInput.addEventListener("change", () => {
    if (enabledInput.checked) {
      start();
    } else {
      stop();
    }
  });

  shareButton.addEventListener("click", async () => {
    if (!lastFile || !navigator.canShare?.({ files: [lastFile] })) {
      return;
    }
    await navigator.share({
      files: [lastFile],
      title: "BFF replication movie",
      text: "BFF Explorer replication event"
    });
  });

  function update(statusUpdate: SimulationStatus): void {
    lastStatus = statusUpdate;
    if (state === "watching") {
      buffer.pruneBefore(performance.now() - MOVIE_PRE_ROLL_MS);
      const result = detector.observe(statusUpdate);
      if (result.detected) {
        trigger(result);
        return;
      }
      setStatus(
        "watching",
        `Watching; ${(buffer.bufferedMs() / 1000).toFixed(0)}s buffered.`
      );
      return;
    }

    if (state === "triggered") {
      const remainingMs = Math.max(0, postRollUntil - performance.now());
      setStatus(
        "triggered",
        `Replication detected at epoch ${detection?.epoch.toLocaleString()}; saving in ${Math.ceil(remainingMs / 1000)}s.`
      );
      if (remainingMs <= 0) {
        stopAndSave();
      }
    }
  }

  function noteInjection(insertedCount: number): void {
    detector.noteInjectedProgram(insertedCount);
  }

  function resetRun(): void {
    detector.reset();
    detection = null;
    postRollUntil = 0;
    buffer.clear({ preserveHeader: Boolean(recorder && recorder.state !== "inactive") });
    if (state === "triggered" || state === "saving") {
      stop();
    } else if (state === "watching") {
      setStatus("watching", "Watching; buffer reset.");
    }
  }

  function start(): void {
    if (!canCapture() || !captureContext) {
      enabledInput.checked = false;
      setStatus("error", "Movie capture unavailable in this browser.");
      return;
    }
    if (recorder && recorder.state !== "inactive") {
      return;
    }

    detector.reset();
    detection = null;
    lastFile = null;
    shareButton.hidden = true;
    buffer.clear();
    mimeType = preferredVideoMimeType((candidate) =>
      MediaRecorder.isTypeSupported(candidate)
    );

    try {
      stream = captureCanvas.captureStream(MOVIE_CAPTURE_FPS);
      recorder = new MediaRecorder(stream, mediaRecorderOptions(mimeType));
      recorder.addEventListener("dataavailable", handleChunk);
      recorder.addEventListener("stop", finalizeCapture);
      recorder.addEventListener("error", () => {
        fail("Movie capture stopped after a recorder error.");
      });
      recorder.start(MOVIE_TIMESLICE_MS);
      state = "watching";
      setStatus("watching", "Watching; rolling buffer empty.");
      drawCaptureFrame();
    } catch {
      fail("Movie capture could not start.");
    }
  }

  function stop(): void {
    const shouldStopRecorder = recorder && recorder.state !== "inactive";
    state = "off";
    detection = null;
    postRollUntil = 0;
    enabledInput.checked = false;
    buffer.clear();
    stopDrawLoop();
    if (shouldStopRecorder) {
      recorder?.stop();
    } else {
      stopStream();
    }
    setStatus("off", "Movie capture off.");
  }

  function trigger(result: ReplicationDetection): void {
    state = "triggered";
    detection = result;
    postRollUntil = performance.now() + MOVIE_POST_ROLL_MS;
    setStatus(
      "triggered",
      `Replication detected at epoch ${result.epoch.toLocaleString()}; recording 60 more seconds.`
    );
  }

  function stopAndSave(): void {
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    state = "saving";
    setStatus("saving", "Saving replication movie...");
    recorder.requestData();
    recorder.stop();
  }

  function handleChunk(event: BlobEvent): void {
    if (event.data.size <= 0) {
      return;
    }
    buffer.add(event.data, performance.now());
    if (state === "watching") {
      buffer.pruneBefore(performance.now() - MOVIE_PRE_ROLL_MS);
    }
  }

  async function finalizeCapture(): Promise<void> {
    const shouldSave = state === "saving";
    stopDrawLoop();
    stopStream();
    recorder = null;

    if (!shouldSave) {
      buffer.clear();
      return;
    }

    try {
      const rawVideo = await buffer.toPlayableBlob(mimeType || "video/webm");
      const durationMs = buffer.durationMs(MOVIE_TIMESLICE_MS);
      const video = mimeType.includes("webm")
        ? await fixWebmDuration(rawVideo, durationMs, { logger: false })
        : rawVideo;
      const extension = videoExtension(mimeType);
      const epoch = detection?.epoch ?? lastStatus?.epoch ?? 0;
      const filename = `bff-replication-epoch-${epoch}.${extension}`;
      lastFile = new File([video], filename, { type: video.type || mimeType });
      downloadBlob(lastFile, filename);
      shareButton.hidden = !navigator.canShare?.({ files: [lastFile] });
      enabledInput.checked = false;
      buffer.clear();
      setStatus(
        "saved",
        `Saved replication movie at epoch ${epoch.toLocaleString()}.`
      );
    } catch {
      fail("Movie capture failed while saving.");
    }
  }

  function drawCaptureFrame(): void {
    if (state === "off" || state === "saved" || state === "error") {
      return;
    }
    try {
      captureContext!.imageSmoothingEnabled = false;
      captureContext!.fillStyle = "#fbfcfa";
      captureContext!.fillRect(0, 0, captureCanvas.width, captureCanvas.height);
      captureContext!.drawImage(
        sourceCanvas,
        0,
        0,
        captureCanvas.width,
        captureCanvas.height
      );
      drawFrameId = requestAnimationFrame(drawCaptureFrame);
    } catch {
      fail("Movie capture could not read the simulation canvas.");
    }
  }

  function stopDrawLoop(): void {
    if (drawFrameId !== 0) {
      cancelAnimationFrame(drawFrameId);
      drawFrameId = 0;
    }
  }

  function fail(message: string): void {
    state = "error";
    enabledInput.checked = false;
    enabledInput.disabled = !canCapture();
    stopDrawLoop();
    stopStream();
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    recorder = null;
    buffer.clear();
    setStatus("error", message);
  }

  function stopStream(): void {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  function setStatus(nextState: CaptureState, text: string): void {
    state = nextState;
    status.textContent = text;
    status.classList.toggle("active", nextState === "watching");
    status.classList.toggle("triggered", nextState === "triggered");
    status.classList.toggle("saving", nextState === "saving");
    status.classList.toggle("error", nextState === "error");
  }

  function canCapture(): boolean {
    return (
      Boolean(captureContext) &&
      typeof captureCanvas.captureStream === "function" &&
      typeof MediaRecorder !== "undefined"
    );
  }

  return {
    update,
    noteInjection,
    resetRun,
    stop
  };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
