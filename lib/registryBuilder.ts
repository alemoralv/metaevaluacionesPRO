/**
 * Client-safe module: no Node.js imports.
 * Contains only the pure function that builds an EvaluationRegistryEntry
 * from in-memory evaluation data. Can be imported from client components.
 */
import type {
  AgentReportContext,
  EvaluationResult,
  EvaluationRegistryEntry,
  EvaluatorAverages,
  LLMConfig,
  EvaluationMode,
} from "./types";

function avg(vals: number[]): number {
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
}

export function buildRegistryEntry(params: {
  datasetFileName: string;
  evaluationMode: EvaluationMode;
  questionCount: number;
  reportContext: AgentReportContext;
  configs: LLMConfig[];
  allResults: Record<string, EvaluationResult[]>;
}): EvaluationRegistryEntry {
  const { datasetFileName, evaluationMode, questionCount, reportContext, configs, allResults } = params;

  const evaluators: EvaluatorAverages[] = configs.map((config) => {
    const results = allResults[config.id] ?? [];
    return {
      configId: config.id,
      provider: config.provider,
      model: config.model,
      temperature: config.temperature,
      avgAccuracy: avg(results.map((r) => r.accuracy)),
      avgCompleteness: avg(results.map((r) => r.completeness)),
      avgRelevance: avg(results.map((r) => r.relevance)),
      avgCoherence: avg(results.map((r) => r.coherence)),
      avgClarity: avg(results.map((r) => r.clarity)),
      avgUsefulness: avg(results.map((r) => r.usefulness)),
      avgOverallScore: avg(results.map((r) => r.overallScore)),
    };
  });

  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    datasetFileName,
    evaluationMode,
    questionCount,
    reportContext,
    evaluators,
  };
}
