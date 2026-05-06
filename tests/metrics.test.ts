import { describe, expect, it } from "vitest";
import { TAPE_SIZE } from "../src/simulation/constants";
import { computeEmergenceMetric } from "../src/simulation/metrics";
import { splitMix32 } from "../src/simulation/rng";

describe("emergence metrics", () => {
  it("keeps random-looking unique soup near zero structure score", () => {
    const soup = new Uint8Array(256 * TAPE_SIZE);
    for (let i = 0; i < soup.length; i += 1) {
      soup[i] = splitMix32(i) & 255;
    }

    const metric = computeEmergenceMetric(soup, 0, []);

    expect(metric.uniqueProgramFraction).toBeGreaterThan(0.9);
    expect(metric.structureScore).toBeLessThan(0.2);
    expect(metric.activeInstructionFraction).toBeGreaterThan(0.02);
  });

  it("detects high structure in repeated whole programs", () => {
    const soup = new Uint8Array(256 * TAPE_SIZE);
    const program = new Uint8Array(TAPE_SIZE);
    for (let i = 0; i < program.length; i += 1) {
      program[i] = (i * 17 + 91) & 255;
    }
    for (let offset = 0; offset < soup.length; offset += TAPE_SIZE) {
      soup.set(program, offset);
    }

    const metric = computeEmergenceMetric(soup, 128, []);

    expect(metric.uniqueProgramFraction).toBeCloseTo(1 / 256);
    expect(metric.dominantProgramFraction).toBe(1);
    expect(metric.compressionGain).toBeGreaterThan(4);
    expect(metric.structureScore).toBeGreaterThan(4);
  });

  it("counts distinct programs exactly instead of by hash-sized identity", () => {
    const soup = new Uint8Array(4 * TAPE_SIZE);
    const a = new Uint8Array(TAPE_SIZE).fill(1);
    const b = new Uint8Array(TAPE_SIZE).fill(1);
    b[TAPE_SIZE - 1] = 2;
    soup.set(a, 0);
    soup.set(a, TAPE_SIZE);
    soup.set(b, TAPE_SIZE * 2);
    soup.set(b, TAPE_SIZE * 3);

    const metric = computeEmergenceMetric(soup, 0, []);

    expect(metric.uniqueProgramFraction).toBe(0.5);
    expect(metric.dominantProgramFraction).toBe(0.5);
  });

  it("marks a sustained phase transition over baseline", () => {
    const baseline = Array.from({ length: 8 }, (_, index) => ({
      epoch: index,
      byteEntropyBpb: 8,
      compressedBpb: 7.98,
      structureScore: 0.02,
      compressionGain: 0.02,
      activeInstructionFraction: 10 / 256,
      instructionEnrichmentScore: 0,
      dominantProgramFraction: 0.001,
      uniqueProgramFraction: 1,
      phaseTransitionScore: 0,
      phaseTransitionDetected: false
    }));
    const elevated = baseline.concat([
      { ...baseline[0], epoch: 9, structureScore: 0.4 },
      { ...baseline[0], epoch: 10, structureScore: 0.42 }
    ]);
    const soup = new Uint8Array(64 * TAPE_SIZE);
    const program = new Uint8Array(TAPE_SIZE);
    for (let i = 0; i < program.length; i += 1) {
      program[i] = (i * 19 + 47) & 255;
    }
    for (let offset = 0; offset < soup.length; offset += TAPE_SIZE) {
      soup.set(program, offset);
    }

    const metric = computeEmergenceMetric(soup, 11, elevated);

    expect(metric.phaseTransitionDetected).toBe(true);
  });
});
