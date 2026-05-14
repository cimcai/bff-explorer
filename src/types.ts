import type {
  RuntimeConfigUpdate,
  SimulationConfig,
  SimulationStatus
} from "./simulation/simulator";

export type WorkerInMessage =
  | {
      type: "init";
      config: SimulationConfig;
      canvas?: OffscreenCanvas;
      useOffscreen: boolean;
    }
  | { type: "play" }
  | { type: "pause" }
  | { type: "setPageVisible"; visible: boolean }
  | { type: "reset"; config: SimulationConfig }
  | { type: "updateConfig"; config: RuntimeConfigUpdate }
  | {
      type: "injectProgram";
      presetId: string;
      bytes: Uint8Array;
      count: number;
    }
  | { type: "previewCheckpoint"; checkpointId: number; requestId: number }
  | { type: "showLive" };

export type WorkerOutMessage =
  | { type: "status"; status: SimulationStatus }
  | {
      type: "previewComplete";
      requestId: number;
      ok: boolean;
      status: SimulationStatus;
    }
  | {
      type: "injectionComplete";
      presetId: string;
      requestedCount: number;
      insertedCount: number;
      status: SimulationStatus;
      error: string | null;
    }
  | {
      type: "frame";
      width: number;
      height: number;
      buffer: ArrayBuffer;
    };
