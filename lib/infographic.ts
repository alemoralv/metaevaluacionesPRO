import {
  AgentReportContext,
  EvaluationResult,
  EvaluationRow,
  LLMConfig,
} from "./types";

type ScoreField =
  | "accuracy"
  | "completeness"
  | "relevance"
  | "coherence"
  | "clarity"
  | "usefulness"
  | "overallScore";

const DIMS: { label: string; field: ScoreField }[] = [
  { label: "Precision", field: "accuracy" },
  { label: "Completitud", field: "completeness" },
  { label: "Relevancia", field: "relevance" },
  { label: "Coherencia", field: "coherence" },
  { label: "Claridad", field: "clarity" },
  { label: "Utilidad", field: "usefulness" },
  { label: "General", field: "overallScore" },
];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return round1(values.reduce((acc, value) => acc + value, 0) / values.length);
}

function llmLabel(config: LLMConfig): string {
  return `${config.model} (T=${config.temperature})`;
}

export interface InfographicDimensionMetric {
  label: string;
  average: number;
}

export interface InfographicEvaluatorSummary {
  id: string;
  label: string;
  model: string;
  temperature: number;
  average: number;
  passRate: number;
}

export interface InfographicKpis {
  totalQuestions: number;
  evaluatorCount: number;
  globalAverage: number;
  bestEvaluatorLabel: string;
  bestEvaluatorScore: number;
  lowestEvaluatorLabel: string;
  lowestEvaluatorScore: number;
}

export interface InfographicPayload {
  reportContext: AgentReportContext;
  generatedAtIso: string;
  kpis: InfographicKpis;
  dimensions: InfographicDimensionMetric[];
  evaluators: InfographicEvaluatorSummary[];
  metaAnalysis?: string | null;
  recommendations?: string[];
  panoramaChartDataUrl?: string;
}

interface BuildInfographicPayloadParams {
  reportContext: AgentReportContext;
  configs: LLMConfig[];
  rows: EvaluationRow[];
  allResults: Record<string, EvaluationResult[]>;
  metaAnalysis?: string | null;
  recommendations?: string[];
  panoramaChartDataUrl?: string;
}

export function buildInfographicPayload(
  params: BuildInfographicPayloadParams
): InfographicPayload {
  const { reportContext, configs, rows, allResults } = params;

  const evaluators: InfographicEvaluatorSummary[] = configs.map((config) => {
    const results = allResults[config.id] || [];
    const overalls = results.map((result) => result.overallScore);
    const passRate =
      overalls.length === 0
        ? 0
        : round1((overalls.filter((value) => value >= 70).length / overalls.length) * 100);

    return {
      id: config.id,
      label: llmLabel(config),
      model: config.model,
      temperature: config.temperature,
      average: avg(overalls),
      passRate,
    };
  });

  const dimensions: InfographicDimensionMetric[] = DIMS.map((dimension) => {
    const values = configs.flatMap((config) =>
      (allResults[config.id] || []).map((result) => result[dimension.field])
    );
    return {
      label: dimension.label,
      average: avg(values),
    };
  });

  const sorted = [...evaluators].sort((a, b) => b.average - a.average);
  const best = sorted[0];
  const lowest = sorted[sorted.length - 1];
  const globalAverage = avg(evaluators.map((evaluator) => evaluator.average));

  return {
    reportContext,
    generatedAtIso: new Date().toISOString(),
    kpis: {
      totalQuestions: rows.length,
      evaluatorCount: configs.length,
      globalAverage,
      bestEvaluatorLabel: best?.label || "N/A",
      bestEvaluatorScore: best?.average || 0,
      lowestEvaluatorLabel: lowest?.label || "N/A",
      lowestEvaluatorScore: lowest?.average || 0,
    },
    dimensions,
    evaluators,
    metaAnalysis: params.metaAnalysis ?? null,
    recommendations: Array.isArray(params.recommendations)
      ? params.recommendations.filter(Boolean)
      : [],
    panoramaChartDataUrl: params.panoramaChartDataUrl,
  };
}

export function infographicPayloadToMarkdown(payload: InfographicPayload): string {
  const dimLines = payload.dimensions
    .map((dimension) => `- ${dimension.label}: ${dimension.average}`)
    .join("\n");

  const evaluatorLines = payload.evaluators
    .map(
      (evaluator, index) =>
        `${index + 1}. ${evaluator.label} | Promedio ${evaluator.average} | Aprobacion ${evaluator.passRate}%`
    )
    .join("\n");

  const recommendationLines =
    payload.recommendations && payload.recommendations.length > 0
      ? payload.recommendations.map((item) => `- ${item}`).join("\n")
      : "- Sin recomendaciones";

  const analysisSection = payload.metaAnalysis?.trim()
    ? payload.metaAnalysis.trim()
    : "No disponible";

  return [
    `# Datos para infografia estandarizada`,
    ``,
    `## Contexto`,
    `- Agente evaluado: ${payload.reportContext.agentName}`,
    `- Fase de prueba: ${payload.reportContext.testPhase}`,
    `- Evaluador principal: ${payload.reportContext.evaluatorName}`,
    `- Fecha ISO: ${payload.generatedAtIso}`,
    ``,
    `## KPI principales`,
    `- Preguntas evaluadas: ${payload.kpis.totalQuestions}`,
    `- Numero de evaluadores: ${payload.kpis.evaluatorCount}`,
    `- Promedio global: ${payload.kpis.globalAverage}`,
    `- Mejor evaluador: ${payload.kpis.bestEvaluatorLabel} (${payload.kpis.bestEvaluatorScore})`,
    `- Evaluador mas bajo: ${payload.kpis.lowestEvaluatorLabel} (${payload.kpis.lowestEvaluatorScore})`,
    ``,
    `## Metricas por dimension`,
    dimLines,
    ``,
    `## Resumen por evaluador`,
    evaluatorLines || "Sin evaluadores",
    ``,
    `## Meta-analisis`,
    analysisSection,
    ``,
    `## Recomendaciones`,
    recommendationLines,
  ].join("\n");
}

export function buildNotebookLmInfographicPrompt(payload: InfographicPayload): string {
  return [
    `Genera una infografia profesional en espanol, orientacion landscape, estilo corporativo.`,
    `El branding debe incluir de forma visible y obligatoria la palabra Profuturo en encabezado.`,
    `Usa SOLO los datos numericos provistos y manten consistencia visual.`,
    `Incluye: encabezado, KPI principales, metricas por dimension, resumen de evaluadores y hallazgos clave.`,
    `No inventes numeros ni conclusiones.`,
    `Evita saturacion visual y traslapes.`,
    `Contexto principal: Agente ${payload.reportContext.agentName}, fase ${payload.reportContext.testPhase}.`,
  ].join(" ");
}
