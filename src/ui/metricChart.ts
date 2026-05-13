import katex from "katex";
import type { MetricSnapshot } from "../simulation/metrics";

export type ChartMetricKey =
  | "structureScore"
  | "phaseTransitionScore"
  | "dominantProgramFraction"
  | "activeInstructionFraction"
  | "uniqueProgramFraction";

export interface ChartMetricDefinition {
  label: string;
  description: string;
  equation: string;
  equationTex: string;
  commentary: string;
  format: (value: number) => string;
  yDomain: readonly [number, number];
}

const MAX_STRUCTURE_SCORE = 8 + 0.25 * (256 / 10 - 1);

export const CHART_METRICS: Record<ChartMetricKey, ChartMetricDefinition> = {
  structureScore: {
    label: "Structure score",
    description:
      "A sum of repeated-byte-pattern signal and executable-instruction enrichment.",
    equation:
      "structure = max(0, byte_entropy_bits_per_byte - compressed_bits_per_byte) + 0.25 * max(0, executable_byte_fraction / random_executable_fraction - 1), where byte_entropy_bits_per_byte is Shannon entropy across all byte values, compressed_bits_per_byte is the smaller estimated bits-per-byte cost from repeated 64-byte programs or repeated 8-byte blocks, executable_byte_fraction is executable_instruction_bytes / total_bytes, and random_executable_fraction = 10/256",
    equationTex:
      "\\begin{aligned}\\mathrm{structure}&=\\max(0,H_{\\mathrm{byte}}-C_{\\mathrm{bytes}})+0.25\\max\\!\\left(0,\\frac{f_{\\mathrm{exec}}}{10/256}-1\\right)\\\\H_{\\mathrm{byte}}&=\\text{Shannon entropy of all byte values, in bits per byte}\\\\C_{\\mathrm{bytes}}&=\\text{estimated compressed bits per byte from repeated tapes or 8-byte blocks}\\\\f_{\\mathrm{exec}}&=\\frac{\\text{number of executable BFF instruction bytes}}{\\text{total number of bytes}}\\end{aligned}",
    commentary:
      "Byte entropy measures how evenly byte values are distributed. Compressed bits per byte estimates how many bits are needed if repeated 64-byte programs or repeated 8-byte blocks are stored once and referenced by index. Executable byte fraction is the share of bytes that are real BFF instructions. This metric rises when exact byte patterns repeat and executable instructions become more common than the random baseline.",
    format: (value) => value.toFixed(3),
    yDomain: [0, MAX_STRUCTURE_SCORE]
  },
  phaseTransitionScore: {
    label: "Phase score",
    description: "How far the structure score has risen above its early baseline.",
    equation:
      "phase = current_structure_score - baseline_mean_structure_score, where baseline_mean_structure_score is the average of the first eight structure-score samples. baseline_standard_deviation is the standard deviation of those same first eight samples. A transition is flagged when phase is greater than max(0.08, 3 * baseline_standard_deviation) for three metric samples in a row.",
    equationTex:
      "\\begin{aligned}\\mathrm{phase}_t&=S_t-\\mu_0\\\\S_t&=\\text{structure score at the current metric sample}\\\\\\mu_0&=\\text{mean of the first eight structure-score samples}\\\\\\sigma_0&=\\text{standard deviation of the first eight structure-score samples}\\\\\\mathrm{transition}&\\iff \\mathrm{phase}_t>\\max(0.08,3\\sigma_0)\\text{ for three samples in a row}\\end{aligned}",
    commentary:
      "The first eight metric samples define the run's starting baseline. A transition is flagged only when structure rises above that baseline by a fixed minimum or by three baseline standard deviations, then remains above the threshold across repeated samples. This avoids treating one-sample noise as sustained repeated-program growth.",
    format: (value) => value.toFixed(3),
    yDomain: [-MAX_STRUCTURE_SCORE, MAX_STRUCTURE_SCORE]
  },
  dominantProgramFraction: {
    label: "Dominant program",
    description: "The share of cells occupied by the most common 64-byte program.",
    equation:
      "dominant_program_fraction = number_of_cells_with_the_most_common_program / total_number_of_cells, where number_of_cells_with_the_most_common_program counts cells whose 64-byte tape exactly matches the most frequent 64-byte tape in the grid.",
    equationTex:
      "\\begin{aligned}\\mathrm{dominant\\ fraction}&=\\frac{n_{\\max}}{N_{\\mathrm{cells}}}\\\\n_{\\max}&=\\text{number of cells holding the most common exact 64-byte tape}\\\\N_{\\mathrm{cells}}&=\\text{total number of grid cells}\\end{aligned}",
    commentary:
      "Each cell contains one 64-byte program. If one exact program appears in more and more cells, interactions are writing that exact byte sequence into additional cells. This is easy to interpret, but it should be read together with the visual pattern and the other metrics because a dominant program is not automatically a self-replicator.",
    format: (value) => `${(value * 100).toFixed(2)}%`,
    yDomain: [0, 1]
  },
  activeInstructionFraction: {
    label: "Executable bytes",
    description: "The share of all bytes that are executable BFF instructions.",
    equation:
      "executable_byte_fraction = executable_instruction_byte_count / total_byte_count, where executable_instruction_byte_count is the number of bytes equal to one of []+-.,<>{} and total_byte_count is grid_cells * 64.",
    equationTex:
      "\\begin{aligned}f_{\\mathrm{exec}}&=\\frac{N_{\\mathrm{exec}}}{N_{\\mathrm{bytes}}}\\\\N_{\\mathrm{exec}}&=\\text{number of bytes equal to }[\\,]\\,+\\,-\\,.\\,,\\,<\\,>\\,\\{\\,\\}\\\\N_{\\mathrm{bytes}}&=\\text{total number of bytes in the grid}\\end{aligned}",
    commentary:
      "Only 10 byte values out of 256 are BFF instructions; all other nonzero byte values are data/no-ops. A random grid starts near 10/256, or about 3.91%. Rising executable-byte density means BFF instruction bytes are becoming more common than expected from random bytes.",
    format: (value) => `${(value * 100).toFixed(2)}%`,
    yDomain: [0, 1]
  },
  uniqueProgramFraction: {
    label: "Unique programs",
    description: "The share of cells that contain distinct 64-byte programs.",
    equation:
      "unique_program_fraction = number_of_distinct_64_byte_tapes / total_number_of_cells, where two tapes are distinct if any byte differs between their 64-byte sequences.",
    equationTex:
      "\\begin{aligned}\\mathrm{unique\\ fraction}&=\\frac{N_{\\mathrm{distinct}}}{N_{\\mathrm{cells}}}\\\\N_{\\mathrm{distinct}}&=\\text{number of distinct exact 64-byte tapes in the grid}\\\\N_{\\mathrm{cells}}&=\\text{total number of grid cells}\\end{aligned}",
    commentary:
      "In a random grid, almost every cell has a distinct 64-byte tape. If exact 64-byte tapes begin repeating, this value falls. A drop means the grid contains fewer distinct programs, which can happen when local interactions write the same program into multiple cells.",
    format: (value) => `${(value * 100).toFixed(2)}%`,
    yDomain: [0, 1]
  }
};

export function renderChartMetricEquation(key: ChartMetricKey): string {
  return katex.renderToString(CHART_METRICS[key].equationTex, {
    displayMode: true,
    throwOnError: false,
    strict: "ignore"
  });
}

export function formatChartMetricValue(
  metric: MetricSnapshot,
  key: ChartMetricKey
): string {
  return CHART_METRICS[key].format(metric[key]);
}

export function drawMetricChart(
  canvas: HTMLCanvasElement,
  history: readonly MetricSnapshot[],
  metricKey: ChartMetricKey
): void {
  const size = prepareChartCanvas(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  if ("setTransform" in ctx) {
    ctx.setTransform(size.pixelRatio, 0, 0, size.pixelRatio, 0, 0);
  }

  const width = size.width;
  const height = size.height;
  const plot = {
    left: 58,
    right: width - 14,
    top: 24,
    bottom: height - 34
  };
  const plotWidth = Math.max(1, plot.right - plot.left);
  const plotHeight = Math.max(1, plot.bottom - plot.top);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfa";
  ctx.fillRect(0, 0, width, height);

  const domain = metricDomain(metricKey, history);
  drawChartFrame(ctx, plot, metricKey, history, domain);

  if (history.length === 0) {
    return;
  }

  if (history.length === 1) {
    const y = metricY(history[0][metricKey], domain, plot, plotHeight);
    ctx.fillStyle = "#256c73";
    ctx.beginPath();
    ctx.arc(plot.left, y, 3, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.strokeStyle = "#256c73";
  ctx.lineWidth = 2.25;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  history.forEach((sample, index) => {
    const x = plot.left + (index / (history.length - 1)) * plotWidth;
    const y = metricY(sample[metricKey], domain, plot, plotHeight);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
}

interface ChartPlotArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface PreparedCanvasSize {
  width: number;
  height: number;
  pixelRatio: number;
}

function prepareChartCanvas(canvas: HTMLCanvasElement): PreparedCanvasSize {
  const fallbackWidth = Math.max(1, canvas.width);
  const fallbackHeight = Math.max(1, canvas.height);
  const rect =
    typeof canvas.getBoundingClientRect === "function"
      ? canvas.getBoundingClientRect()
      : null;
  const cssWidth = Math.max(
    1,
    Math.round(rect && rect.width > 0 ? rect.width : fallbackWidth)
  );
  const cssHeight = Math.max(
    1,
    Math.round(rect && rect.height > 0 ? rect.height : fallbackHeight)
  );
  const pixelRatio =
    typeof window === "undefined"
      ? 1
      : Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const backingWidth = Math.round(cssWidth * pixelRatio);
  const backingHeight = Math.round(cssHeight * pixelRatio);

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }

  return {
    width: cssWidth,
    height: cssHeight,
    pixelRatio
  };
}

function drawChartFrame(
  ctx: CanvasRenderingContext2D,
  plot: ChartPlotArea,
  metricKey: ChartMetricKey,
  history: readonly MetricSnapshot[],
  domain: MetricDomain
): void {
  const plotWidth = plot.right - plot.left;
  const plotHeight = plot.bottom - plot.top;
  ctx.strokeStyle = "#e1e8e4";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const tickValue = domain.max - (i / 4) * (domain.max - domain.min);
    const y = metricY(tickValue, domain, plot, plotHeight);
    ctx.beginPath();
    ctx.moveTo(plot.left, y + 0.5);
    ctx.lineTo(plot.right, y + 0.5);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(plot.left + 0.5, plot.top);
  ctx.lineTo(plot.left + 0.5, plot.bottom);
  ctx.lineTo(plot.right, plot.bottom + 0.5);
  ctx.stroke();

  ctx.fillStyle = "#74817b";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(CHART_METRICS[metricKey].label, plot.left, 13);
  ctx.textAlign = "center";
  ctx.fillText("Epoch", plot.left + plotWidth / 2, plot.bottom + 24);

  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i += 2) {
    const tickValue = domain.max - (i / 4) * (domain.max - domain.min);
    const y = metricY(tickValue, domain, plot, plotHeight);
    ctx.fillText(axisValue(tickValue, metricKey), plot.left - 8, y);
  }

  if (history.length === 0) {
    return;
  }
  ctx.textAlign = "left";
  ctx.fillText(String(history[0].epoch), plot.left, plot.bottom + 10);
  ctx.textAlign = "right";
  ctx.fillText(
    String(history[history.length - 1].epoch),
    plot.left + plotWidth,
    plot.bottom + 10
  );
}

interface MetricDomain {
  min: number;
  max: number;
}

function metricDomain(
  metricKey: ChartMetricKey,
  history: readonly MetricSnapshot[]
): MetricDomain {
  const values = history
    .map((sample) => sample[metricKey])
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return fallbackDomain(metricKey);
  }

  if (metricKey === "phaseTransitionScore") {
    const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 0.05);
    const bound = niceCeil(maxAbs * 1.18);
    return {
      min: -bound,
      max: bound
    };
  }

  if (metricKey === "uniqueProgramFraction") {
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = Math.max(maxValue - minValue, 0.01);
    return {
      min: Math.max(0, Math.floor((minValue - range * 0.3) * 100) / 100),
      max: 1
    };
  }

  const maxValue = Math.max(...values, 0);
  const minimumUpper =
    metricKey === "structureScore"
      ? 0.05
      : metricKey === "activeInstructionFraction"
        ? 0.05
        : 0.01;
  const upper = niceCeil(Math.max(maxValue * 1.18, minimumUpper));
  const fixedMax = CHART_METRICS[metricKey].yDomain[1];
  return {
    min: 0,
    max: Math.min(fixedMax, upper)
  };
}

function fallbackDomain(metricKey: ChartMetricKey): MetricDomain {
  if (metricKey === "phaseTransitionScore") {
    return {
      min: -0.1,
      max: 0.1
    };
  }
  if (metricKey === "structureScore") {
    return {
      min: 0,
      max: 1
    };
  }
  return {
    min: CHART_METRICS[metricKey].yDomain[0],
    max: CHART_METRICS[metricKey].yDomain[1]
  };
}

function niceCeil(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice =
    normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 5
          ? 5
          : 10;
  return nice * magnitude;
}

function metricY(
  value: number,
  domain: MetricDomain,
  plot: ChartPlotArea,
  plotHeight: number
): number {
  const range = domain.max - domain.min || 1;
  const normalized = clamp((value - domain.min) / range, 0, 1);
  return plot.bottom - normalized * plotHeight;
}

function axisValue(value: number, metricKey: ChartMetricKey): string {
  if (
    metricKey === "dominantProgramFraction" ||
    metricKey === "activeInstructionFraction" ||
    metricKey === "uniqueProgramFraction"
  ) {
    const percent = value * 100;
    const rounded = Math.round(percent);
    if (Math.abs(percent - rounded) < 0.05) {
      return `${rounded}%`;
    }
    return `${percent < 10 && percent > 0 ? percent.toFixed(1) : rounded}%`;
  }
  const abs = Math.abs(value);
  if (abs === 0) {
    return "0.00";
  }
  if (abs < 0.01) {
    return value.toFixed(3);
  }
  return value.toFixed(abs < 10 ? 2 : 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
