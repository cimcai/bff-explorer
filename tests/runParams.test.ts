import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/simulation/simulator";
import {
  mergeRunParamsIntoConfig,
  parseRunParamsFromUrl,
  parseRunParamsSource,
  runParamsToJson,
  runParamsToUrl
} from "../src/ui/runParams";

describe("run parameter import/export", () => {
  it("parses pasted JSON run params", () => {
    expect(
      parseRunParamsSource(
        JSON.stringify({
          seed: 1,
          mutationRate: 1 / 8192,
          metricInterval: 64,
          checkpointInterval: 256,
          timeBudgetMs: 32
        })
      )
    ).toEqual({
      fixedSeed: true,
      seed: 1,
      mutationRate: 1 / 8192,
      metricInterval: 64,
      checkpointInterval: 256,
      timeBudgetMs: 32
    });
  });

  it("parses wrapped JSON and clamps unsafe values", () => {
    expect(
      parseRunParamsSource(
        JSON.stringify({
          config: {
            seed: -3,
            mutation: 2,
            checkpointInterval: 0,
            metricInterval: 2.9,
            timeBudget: 999
          }
        })
      )
    ).toEqual({
      fixedSeed: true,
      seed: 0,
      mutationRate: 1,
      checkpointInterval: 1,
      metricInterval: 2,
      timeBudgetMs: 32
    });
  });

  it("parses URLs with query params", () => {
    expect(
      parseRunParamsFromUrl(
        "https://dangirsh.org/bff/?fixedSeed=1&seed=12&mutationRate=0.003&checkpointInterval=128&metricInterval=64&timeBudgetMs=8"
      )
    ).toEqual({
      fixedSeed: true,
      seed: 12,
      mutationRate: 0.003,
      checkpointInterval: 128,
      metricInterval: 64,
      timeBudgetMs: 8
    });
  });

  it("parses URLs with encoded JSON params", () => {
    const params = encodeURIComponent(
      JSON.stringify({ seed: 7, mutationRate: 0.001 })
    );

    expect(parseRunParamsFromUrl(`https://dangirsh.org/bff/?params=${params}`))
      .toEqual({
        fixedSeed: true,
        seed: 7,
        mutationRate: 0.001
      });
  });

  it("merges params into a simulation config", () => {
    const config = mergeRunParamsIntoConfig(defaultConfig(), {
      seed: 3,
      mutationRate: 0.01
    });

    expect(config.seed).toBe(3);
    expect(config.mutationRate).toBe(0.01);
    expect(config.gridWidth).toBe(defaultConfig().gridWidth);
  });

  it("serializes the current run as JSON and URL params", () => {
    const config = { ...defaultConfig(), seed: 9, metricInterval: 64 };
    const json = JSON.parse(runParamsToJson(config));
    const url = new URL(runParamsToUrl(config, "https://dangirsh.org/bff/"));

    expect(json).toMatchObject({
      fixedSeed: true,
      seed: 9,
      metricInterval: 64
    });
    expect(url.searchParams.get("fixedSeed")).toBe("true");
    expect(url.searchParams.get("seed")).toBe("9");
    expect(url.searchParams.get("metricInterval")).toBe("64");
  });
});
