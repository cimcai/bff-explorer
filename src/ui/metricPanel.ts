import type { MetricSnapshot } from "../simulation/metrics";
import {
  CHART_METRICS,
  drawMetricChart,
  formatChartMetricValue,
  renderChartMetricEquation,
  type ChartMetricKey
} from "./metricChart";
import { setText } from "./dom";

export interface MetricPanel {
  selectedMetric(): ChartMetricKey;
  update(metric: MetricSnapshot, history: readonly MetricSnapshot[]): void;
}

interface MetricPanelRefs {
  metricChart: HTMLCanvasElement;
  metricSelect: HTMLSelectElement;
  chartEquation: HTMLElement;
  phaseBadge: HTMLSpanElement;
}

export function createMetricPanel(refs: MetricPanelRefs): MetricPanel {
  const { metricChart, metricSelect, chartEquation, phaseBadge } = refs;
  let selectedChartMetric: ChartMetricKey = "structureScore";
  let lastMetricHistory: readonly MetricSnapshot[] = [];
  let lastMetric: MetricSnapshot | null = null;

  metricSelect.addEventListener("change", () => {
    selectedChartMetric = metricSelect.value as ChartMetricKey;
    updateCopy(lastMetric ?? undefined);
    drawMetricChart(metricChart, lastMetricHistory, selectedChartMetric);
  });

  function selectedMetric(): ChartMetricKey {
    return selectedChartMetric;
  }

  function update(
    metric: MetricSnapshot,
    history: readonly MetricSnapshot[]
  ): void {
    lastMetric = metric;
    lastMetricHistory = history;
    updateCopy(metric);
    phaseBadge.textContent = metric.phaseTransitionDetected
      ? "transition"
      : "baseline";
    phaseBadge.classList.toggle("detected", metric.phaseTransitionDetected);
    drawMetricChart(metricChart, history, selectedChartMetric);
  }

  function updateCopy(metric?: MetricSnapshot): void {
    const option = CHART_METRICS[selectedChartMetric];
    setText("chartMetricLabel", option.label);
    setText("chartDescription", option.description);
    chartEquation.textContent = renderChartMetricEquation(selectedChartMetric);
    chartEquation.setAttribute("aria-label", option.equation);
    setText("chartCommentary", option.commentary);
    if (metric) {
      setText(
        "chartMetricValue",
        formatChartMetricValue(metric, selectedChartMetric)
      );
    }
  }

  return {
    selectedMetric,
    update
  };
}
