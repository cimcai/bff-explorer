import { TAPE_SIZE } from "./constants";

const PAPER_REPLICATOR_PREFIX = "[[{.>]-]";
const PAPER_REPLICATOR_SUFFIX = "]-]>.{[[";
const FILLER_LENGTH =
  TAPE_SIZE - PAPER_REPLICATOR_PREFIX.length - PAPER_REPLICATOR_SUFFIX.length;

export interface ReplicatorPreset {
  id: string;
  name: string;
  description: string;
  defaultCount: number;
  source: string;
}

export const DEFAULT_REPLICATOR_PRESET_ID = "paper-space";

export const REPLICATOR_PRESETS: readonly ReplicatorPreset[] = [
  {
    id: "paper-space",
    name: "Paper replicator",
    description:
      "The known 64-byte BFF replicator used as the simulator's positive-control example. Its middle bytes are spaces, which are inert no-op data.",
    defaultCount: 64,
    source: paperReplicatorWithFiller(" ")
  },
  {
    id: "paper-tilde",
    name: "Tilde no-op variant",
    description:
      "The same executable skeleton with tilde bytes in the inert middle region. Useful when you want a visually distinct neutral marker.",
    defaultCount: 64,
    source: paperReplicatorWithFiller("~")
  },
  {
    id: "paper-a",
    name: "Letter no-op variant",
    description:
      "The same exact-copy replicator with ASCII A in the inert middle region. The filler is still data, not an executable BFF instruction.",
    defaultCount: 64,
    source: paperReplicatorWithFiller("A")
  },
  {
    id: "paper-ff",
    name: "High-byte no-op variant",
    description:
      "The same exact-copy replicator with byte 255 in the inert middle region. This gives a high-contrast data-byte signature in the grid.",
    defaultCount: 64,
    source: paperReplicatorWithFiller(String.fromCharCode(255))
  }
];

export function replicatorPresetById(id: string): ReplicatorPreset {
  return (
    REPLICATOR_PRESETS.find((preset) => preset.id === id) ??
    REPLICATOR_PRESETS[0]
  );
}

export function replicatorPresetBytes(id: string): Uint8Array {
  const preset = replicatorPresetById(id);
  if (preset.source.length !== TAPE_SIZE) {
    throw new Error(`Replicator preset ${preset.id} must be ${TAPE_SIZE} bytes`);
  }
  return Uint8Array.from(preset.source, (char) => char.charCodeAt(0) & 255);
}

function paperReplicatorWithFiller(filler: string): string {
  return (
    PAPER_REPLICATOR_PREFIX +
    filler.repeat(FILLER_LENGTH) +
    PAPER_REPLICATOR_SUFFIX
  );
}
