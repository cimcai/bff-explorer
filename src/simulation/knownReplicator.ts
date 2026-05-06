import {
  DEFAULT_REPLICATOR_PRESET_ID,
  replicatorPresetById,
  replicatorPresetBytes
} from "./replicatorPresets";

export const KNOWN_BFF_REPLICATOR = replicatorPresetById(
  DEFAULT_REPLICATOR_PRESET_ID
).source;

export function knownReplicatorBytes(): Uint8Array {
  return replicatorPresetBytes(DEFAULT_REPLICATOR_PRESET_ID);
}
