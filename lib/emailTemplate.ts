/**
 * ============================================================
 * PLANTILLA DE CORREO - EVALUACIÓN INDIVIDUAL
 * ============================================================
 * Edita COMPOSE_EMAIL_TEMPLATE para personalizar el correo
 * que se abre al hacer clic en "Enviar por correo".
 *
 * Tokens disponibles:
 *   {{evaluatorName}}    - Nombre del evaluador
 *   {{agentName}}        - Nombre del agente evaluado
 *   {{modelName}}        - Nombre del modelo del agente
 *   {{knowledgeSource}}  - Fuente de conocimiento
 *   {{testPhase}}        - Fase de prueba
 *   {{datasetFileName}}  - Nombre del archivo CSV
 *   {{questionCount}}    - Número de preguntas evaluadas
 *   {{evaluationMode}}   - Modo de evaluación (one-shot / conversacional)
 *   {{date}}             - Fecha de la evaluación
 *   {{evaluatorResults}} - Bloque de resultados por evaluador LLM
 * ============================================================
 */
export const COMPOSE_EMAIL_TEMPLATE = `Hola Víctor,

Se completó la evaluación del agente "{{agentName}}" en la fase "{{testPhase}}".

Evaluador: {{evaluatorName}}
Modelo del agente: {{modelName}}
Fuente de conocimiento: {{knowledgeSource}}
Dataset: {{datasetFileName}}
Preguntas evaluadas: {{questionCount}}
Modo de evaluación: {{evaluationMode}}
Fecha: {{date}}

{{evaluatorResults}}

---
Generado por MetaEvaluaciones PRO
`;

/**
 * Template for each LLM evaluator block inside COMPOSE_EMAIL_TEMPLATE.
 * Tokens: {{llmLabel}}, {{avgAccuracy}}, {{avgCompleteness}},
 *         {{avgRelevance}}, {{avgCoherence}}, {{avgClarity}},
 *         {{avgUsefulness}}, {{avgOverallScore}}
 */
export const EVALUATOR_BLOCK_TEMPLATE = `--- Evaluador LLM: {{llmLabel}} ---
  Precisión:     {{avgAccuracy}}
  Completitud:   {{avgCompleteness}}
  Relevancia:    {{avgRelevance}}
  Coherencia:    {{avgCoherence}}
  Claridad:      {{avgClarity}}
  Utilidad:      {{avgUsefulness}}
  Calificación general: {{avgOverallScore}}
`;

import type { AgentReportContext, EvaluationResult, LLMConfig } from "./types";

function avg(vals: number[]): number {
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
}

function llmLabel(config: LLMConfig): string {
  const provider = config.provider === "openai" ? "OpenAI" : "Gemini";
  return `${provider} · ${config.model} (T=${config.temperature})`;
}

export function buildEmailSubject(
  context: AgentReportContext,
  datasetFileName: string
): string {
  const date = new Date().toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `[MetaEvaluaciones PRO] Resultados evaluación - ${context.agentName} (${datasetFileName}) - ${date}`;
}

export function buildEmailBody(
  context: AgentReportContext,
  configs: LLMConfig[],
  allResults: Record<string, EvaluationResult[]>,
  datasetFileName: string
): string {
  const date = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Build evaluator blocks
  const evaluatorResults = configs
    .map((config) => {
      const results = allResults[config.id] ?? [];
      return EVALUATOR_BLOCK_TEMPLATE
        .replace("{{llmLabel}}", llmLabel(config))
        .replace("{{avgAccuracy}}", String(avg(results.map((r) => r.accuracy))))
        .replace("{{avgCompleteness}}", String(avg(results.map((r) => r.completeness))))
        .replace("{{avgRelevance}}", String(avg(results.map((r) => r.relevance))))
        .replace("{{avgCoherence}}", String(avg(results.map((r) => r.coherence))))
        .replace("{{avgClarity}}", String(avg(results.map((r) => r.clarity))))
        .replace("{{avgUsefulness}}", String(avg(results.map((r) => r.usefulness))))
        .replace("{{avgOverallScore}}", String(avg(results.map((r) => r.overallScore))));
    })
    .join("\n");

  const questionCount =
    configs.length > 0 ? (allResults[configs[0].id]?.length ?? 0) : 0;

  return COMPOSE_EMAIL_TEMPLATE
    .replace("{{evaluatorName}}", context.evaluatorName)
    .replace("{{agentName}}", context.agentName)
    .replace("{{modelName}}", context.modelName)
    .replace("{{knowledgeSource}}", context.knowledgeSource)
    .replace("{{testPhase}}", context.testPhase)
    .replace("{{datasetFileName}}", datasetFileName)
    .replace("{{questionCount}}", String(questionCount))
    .replace("{{evaluationMode}}", "one-shot / conversacional") // determined by caller if needed
    .replace("{{date}}", date)
    .replace("{{evaluatorResults}}", evaluatorResults);
}
