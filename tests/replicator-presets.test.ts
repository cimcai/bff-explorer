import { describe, expect, it } from "vitest";
import { evaluateTape } from "../src/simulation/bff";
import { PAIR_TAPE_SIZE, TAPE_SIZE } from "../src/simulation/constants";
import {
  REPLICATOR_PRESETS,
  replicatorPresetBytes
} from "../src/simulation/replicatorPresets";

describe("replicator presets", () => {
  it("defines a small selectable library of 64-byte programs", () => {
    expect(REPLICATOR_PRESETS.length).toBeGreaterThanOrEqual(3);

    for (const preset of REPLICATOR_PRESETS) {
      expect(preset.id).toMatch(/^[a-z0-9-]+$/);
      expect(preset.name.length).toBeGreaterThan(3);
      expect(preset.description.length).toBeGreaterThan(30);
      expect(preset.defaultCount).toBeGreaterThan(0);
      expect(replicatorPresetBytes(preset.id)).toHaveLength(TAPE_SIZE);
    }
  });

  it("copies every preset into an all-null partner cell", () => {
    for (const preset of REPLICATOR_PRESETS) {
      const bytes = replicatorPresetBytes(preset.id);
      const tape = new Uint8Array(PAIR_TAPE_SIZE);
      tape.set(bytes, 0);

      const result = evaluateTape(tape, 8192);

      expect(result.haltedByStepLimit).toBe(true);
      expect(Array.from(tape.slice(TAPE_SIZE))).toEqual(Array.from(bytes));
    }
  });
});
