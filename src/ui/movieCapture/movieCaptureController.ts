import { fixWebmDuration } from "@fix-webm-duration/fix";
import { ReplicationDetector } from "../../simulation/replicationDetector";
import type { ReplicationDetection } from "../../simulation/replicationDetector";
import type { SimulationStatus } from "../../simulation/simulator";
import { RollingCaptureBuffer } from "./captureBuffer";
import {
  MOVIE_CAPTURE_FPS,
  MOVIE_CAPTURE_HEIGHT,
  MOVIE_CAPTURE_WIDTH,
  MOVIE_MAX_BUFFER_BYTES,
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
  manualButton: HTMLButtonElement;
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
type TriggerKind = "replication" | "manual";

export function createMovieCaptureController(
  options: MovieCaptureControllerOptions
): MovieCaptureController {
  const { refs } = options;
  const {
    sourceCanvas,
    captureCanvas,
    enabledInput,
    status,
    manualButton,
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
  let triggerKind: TriggerKind | null = null;
  let lastStatus: SimulationStatus | null = null;
  let lastFile: File | null = null;
  let mimeType = "";
  let supportedMimeType = "";

  captureCanvas.width = MOVIE_CAPTURE_WIDTH;
  captureCanvas.height = MOVIE_CAPTURE_HEIGHT;
  shareButton.hidden = true;
  manualButton.disabled = true;

  supportedMimeType = detectSupportedMimeType();
  if (!canCapture()) {
    enabledInput.disabled = true;
    setStatus("error", unsupportedCaptureMessage());
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

  manualButton.addEventListener("click", () => {
    triggerManualCapture();
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
      pruneCaptureBuffer();
      const result = detector.observe(statusUpdate);
      if (result.detected) {
        trigger(result);
        return;
      }
      setStatus(
        "watching",
        `Watching WebM; ${(buffer.bufferedMs() / 1000).toFixed(0)}s buffered.`
      );
      return;
    }

    if (state === "triggered") {
      const remainingMs = Math.max(0, postRollUntil - performance.now());
      const label =
        triggerKind === "manual"
          ? "Manual movie capture"
          : "Replication detected";
      setStatus(
        "triggered",
        `${label} at epoch ${detection?.epoch.toLocaleString()}; saving in ${Math.ceil(remainingMs / 1000)}s.`
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
    triggerKind = null;
    postRollUntil = 0;
    buffer.clear({ preserveHeader: Boolean(recorder && recorder.state !== "inactive") });
    if (state === "triggered" || state === "saving") {
      stop();
    } else if (state === "watching") {
      setStatus("watching", "Watching WebM; buffer reset.");
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
    triggerKind = null;
    lastFile = null;
    shareButton.hidden = true;
    buffer.clear();
    mimeType = supportedMimeType || detectSupportedMimeType();
    if (!mimeType) {
      enabledInput.checked = false;
      setStatus("error", unsupportedCaptureMessage());
      return;
    }

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
      setStatus("watching", "Watching WebM; rolling buffer empty.");
      drawCaptureFrame();
    } catch {
      fail("Movie capture could not start.");
    }
  }

  function stop(): void {
    const shouldStopRecorder = recorder && recorder.state !== "inactive";
    state = "off";
    detection = null;
    triggerKind = null;
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

  function trigger(
    result: ReplicationDetection,
    kind: TriggerKind = "replication"
  ): void {
    state = "triggered";
    detection = result;
    triggerKind = kind;
    postRollUntil = performance.now() + MOVIE_POST_ROLL_MS;
    const label =
      kind === "manual" ? "Manual movie capture" : "Replication detected";
    setStatus(
      "triggered",
      `${label} at epoch ${result.epoch.toLocaleString()}; recording 60 more seconds.`
    );
  }

  function triggerManualCapture(): void {
    if (!canCapture() || !captureContext) {
      setStatus("error", "Movie capture unavailable in this browser.");
      return;
    }
    if (state === "triggered" || state === "saving") {
      return;
    }
    if (state !== "watching") {
      enabledInput.checked = true;
      start();
    }
    if (state === "watching") {
      trigger(manualDetection(), "manual");
    }
  }

  function stopAndSave(): void {
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    state = "saving";
    setStatus(
      "saving",
      triggerKind === "manual" ? "Saving movie..." : "Saving replication movie..."
    );
    recorder.requestData();
    recorder.stop();
  }

  function handleChunk(event: BlobEvent): void {
    if (event.data.size <= 0) {
      return;
    }
    buffer.add(event.data, performance.now());
    if (state === "watching") {
      pruneCaptureBuffer();
    } else {
      buffer.pruneToMaxBytes(MOVIE_MAX_BUFFER_BYTES);
    }
  }

  async function finalizeCapture(): Promise<void> {
    const shouldSave = state === "saving";
    const savedTriggerKind = triggerKind;
    stopDrawLoop();
    stopStream();
    recorder = null;

    if (!shouldSave) {
      buffer.clear();
      triggerKind = null;
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
      const filenamePrefix =
        savedTriggerKind === "manual" ? "bff-movie" : "bff-replication";
      const filename = `${filenamePrefix}-epoch-${epoch}.${extension}`;
      lastFile = new File([video], filename, { type: video.type || mimeType });
      downloadBlob(lastFile, filename);
      shareButton.hidden = !navigator.canShare?.({ files: [lastFile] });
      enabledInput.checked = false;
      buffer.clear();
      triggerKind = null;
      setStatus(
        "saved",
        `Saved WebM ${savedTriggerKind === "manual" ? "movie" : "replication movie"} at epoch ${epoch.toLocaleString()}.`
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
    manualButton.disabled = !canCapture();
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

  function pruneCaptureBuffer(): void {
    buffer.pruneBefore(performance.now() - MOVIE_PRE_ROLL_MS);
    buffer.pruneToMaxBytes(MOVIE_MAX_BUFFER_BYTES);
  }

  function setStatus(nextState: CaptureState, text: string): void {
    state = nextState;
    status.textContent = text;
    manualButton.disabled =
      !canCapture() || nextState === "triggered" || nextState === "saving";
    status.classList.toggle("active", nextState === "watching");
    status.classList.toggle("triggered", nextState === "triggered");
    status.classList.toggle("saving", nextState === "saving");
    status.classList.toggle("error", nextState === "error");
  }

  function canCapture(): boolean {
    supportedMimeType = detectSupportedMimeType();
    return (
      Boolean(captureContext) &&
      typeof captureCanvas.captureStream === "function" &&
      typeof MediaRecorder !== "undefined" &&
      Boolean(supportedMimeType)
    );
  }

  return {
    update,
    noteInjection,
    resetRun,
    stop
  };

  function manualDetection(): ReplicationDetection {
    return {
      detected: true,
      confidence: 1,
      epoch: lastStatus?.epoch ?? 0,
      reason: "manual movie capture",
      metric: lastStatus?.latestMetric ?? null,
      topProgram: lastStatus?.topPrograms[0] ?? null
    };
  }
}

function detectSupportedMimeType(): string {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return "";
  }
  return preferredVideoMimeType((candidate) =>
    MediaRecorder.isTypeSupported(candidate)
  );
}

function unsupportedCaptureMessage(): string {
  return "Movie capture needs WebM MediaRecorder support in this browser.";
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
