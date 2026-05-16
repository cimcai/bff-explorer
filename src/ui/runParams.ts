import { MAX_TIME_BUDGET_MS } from "../simulation/constants";
import type { SimulationConfig } from "../simulation/simulator";

export interface RunParams {
  fixedSeed?: boolean;
  seed?: number;
  mutationRate?: number;
  checkpointInterval?: number;
  metricInterval?: number;
  timeBudgetMs?: number;
}

const MAX_SEED = 0xffff_ffff;
const PARAM_QUERY_KEYS = [
  "fixedSeed",
  "seed",
  "mutationRate",
  "checkpointInterval",
  "metricInterval",
  "timeBudgetMs"
] as const;

export function parseRunParamsSource(source: string): RunParams {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error("Paste JSON or a URL with run parameters.");
  }

  const urlParams = tryParseUrlParams(trimmed);
  if (urlParams) {
    return urlParams;
  }

  return normalizeRunParams(JSON.parse(trimmed));
}

export function parseRunParamsFromUrl(href: string): RunParams | null {
  const url = new URL(href, "https://example.invalid");
  return paramsFromSearchParams(url.searchParams) ?? paramsFromHash(url.hash);
}

export function mergeRunParamsIntoConfig(
  config: SimulationConfig,
  params: RunParams | null
): SimulationConfig {
  if (!params) {
    return { ...config };
  }
  return {
    ...config,
    seed: params.seed ?? config.seed,
    mutationRate: params.mutationRate ?? config.mutationRate,
    checkpointInterval: params.checkpointInterval ?? config.checkpointInterval,
    metricInterval: params.metricInterval ?? config.metricInterval,
    timeBudgetMs: params.timeBudgetMs ?? config.timeBudgetMs
  };
}

export function runParamsToJson(config: SimulationConfig): string {
  return JSON.stringify(paramsFromConfig(config), null, 2);
}

export function runParamsToUrl(config: SimulationConfig, href: string): string {
  const base =
    typeof globalThis.location?.href === "string"
      ? globalThis.location.href
      : "https://example.invalid";
  const url = new URL(href, base);
  url.searchParams.delete("params");
  url.searchParams.delete("bffParams");
  for (const key of PARAM_QUERY_KEYS) {
    url.searchParams.delete(key);
  }
  const params = paramsFromConfig(config);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function tryParseUrlParams(source: string): RunParams | null {
  if (!looksLikeUrl(source)) {
    return null;
  }
  const parsed = parseRunParamsFromUrl(source);
  if (!parsed) {
    throw new Error("URL does not contain BFF run parameters.");
  }
  return parsed;
}

function looksLikeUrl(source: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(source) ||
    source.startsWith("?") ||
    source.startsWith("#") ||
    source.startsWith("/")
  );
}

function paramsFromSearchParams(searchParams: URLSearchParams): RunParams | null {
  const encoded = searchParams.get("params") ?? searchParams.get("bffParams");
  if (encoded) {
    return normalizeRunParams(parseEncodedParams(encoded));
  }

  const raw: Record<string, string> = {};
  let found = false;
  for (const key of PARAM_QUERY_KEYS) {
    const value = searchParams.get(key);
    if (value !== null) {
      raw[key] = value;
      found = true;
    }
  }

  const mutation = searchParams.get("mutation");
  if (mutation !== null) {
    raw.mutationRate = mutation;
    found = true;
  }
  const timeBudget = searchParams.get("timeBudget");
  if (timeBudget !== null) {
    raw.timeBudgetMs = timeBudget;
    found = true;
  }

  return found ? normalizeRunParams(raw) : null;
}

function paramsFromHash(hash: string): RunParams | null {
  if (!hash) {
    return null;
  }
  const value = hash.slice(1);
  const query = value.includes("?") ? value.slice(value.indexOf("?") + 1) : value;
  return query.includes("=") ? paramsFromSearchParams(new URLSearchParams(query)) : null;
}

function parseEncodedParams(value: string): unknown {
  const decoded = decodeURIComponent(value);
  try {
    return JSON.parse(decoded);
  } catch {
    return JSON.parse(base64UrlDecode(decoded));
  }
}

function base64UrlDecode(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  return globalThis.atob(padded);
}

function normalizeRunParams(rawValue: unknown): RunParams {
  const raw = unwrapRunParams(rawValue);
  const params: RunParams = {};

  const fixedSeed = readBoolean(raw, "fixedSeed");
  if (fixedSeed !== undefined) {
    params.fixedSeed = fixedSeed;
  }

  const seed = readNumber(raw, "seed");
  if (seed !== undefined) {
    params.seed = clampInteger(seed, 0, MAX_SEED);
    params.fixedSeed ??= true;
  }

  const mutationRate = readNumber(raw, "mutationRate", "mutation");
  if (mutationRate !== undefined) {
    params.mutationRate = clampNumber(mutationRate, 0, 1);
  }

  const checkpointInterval = readNumber(raw, "checkpointInterval");
  if (checkpointInterval !== undefined) {
    params.checkpointInterval = clampInteger(checkpointInterval, 1, 1_000_000);
  }

  const metricInterval = readNumber(raw, "metricInterval");
  if (metricInterval !== undefined) {
    params.metricInterval = clampInteger(metricInterval, 1, 1_000_000);
  }

  const timeBudgetMs = readNumber(raw, "timeBudgetMs", "timeBudget");
  if (timeBudgetMs !== undefined) {
    params.timeBudgetMs = clampNumber(timeBudgetMs, 1, MAX_TIME_BUDGET_MS);
  }

  if (Object.keys(params).length === 0) {
    throw new Error("Run params must include at least one supported field.");
  }

  return params;
}

function unwrapRunParams(rawValue: unknown): Record<string, unknown> {
  if (!isRecord(rawValue)) {
    throw new Error("Run params must be a JSON object.");
  }
  for (const key of ["params", "runParams", "config", "simulationConfig"]) {
    if (isRecord(rawValue[key])) {
      return rawValue[key];
    }
  }
  return rawValue;
}

function paramsFromConfig(config: SimulationConfig): Required<RunParams> {
  return {
    fixedSeed: true,
    seed: config.seed >>> 0,
    mutationRate: config.mutationRate,
    checkpointInterval: config.checkpointInterval,
    metricInterval: config.metricInterval,
    timeBudgetMs: config.timeBudgetMs
  };
}

function readNumber(
  raw: Record<string, unknown>,
  key: string,
  alternateKey?: string
): number | undefined {
  const value = raw[key] ?? (alternateKey ? raw[alternateKey] : undefined);
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${key} must be a finite number.`);
  }
  return numeric;
}

function readBoolean(
  raw: Record<string, unknown>,
  key: string
): boolean | undefined {
  const value = raw[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (value === 1 || value === "1" || value === "true") {
    return true;
  }
  if (value === 0 || value === "0" || value === "false") {
    return false;
  }
  throw new Error(`${key} must be true or false.`);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
