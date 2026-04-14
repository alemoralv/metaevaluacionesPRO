import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  ConversationEvaluationRow,
  ConversationTurn,
  EvaluationRow,
  EvaluationResult,
  LLMProvider,
} from "./types";

const defaultOpenAiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
const defaultGeminiModel = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const SYSTEM_PROMPT = `Eres un evaluador experto de respuestas de agentes de IA para atencion al cliente.
Tu objetivo principal es medir si la respuesta real (actualResponse) transmite el MISMO SIGNIFICADO y la MISMA INFORMACION clave que la respuesta esperada (expectedResponse).

Principios de evaluacion:
1) Prioriza equivalencia semantica e informativa por encima del estilo.
2) No penalices por "echar mas rollo" si lo adicional es consistente, no contradice y no inventa hechos.
3) Penaliza fuertemente omisiones de informacion critica de expectedResponse.
4) Penaliza fuertemente invenciones/alucinaciones.

Evalua en 6 dimensiones con puntaje de 0 a 100:
- accuracy
- completeness
- relevance
- coherence
- clarity
- usefulness

Responde UNICAMENTE con un JSON valido con esta estructura exacta:
{
  "accuracy": <numero entero de 0 a 100>,
  "completeness": <numero entero de 0 a 100>,
  "relevance": <numero entero de 0 a 100>,
  "coherence": <numero entero de 0 a 100>,
  "clarity": <numero entero de 0 a 100>,
  "usefulness": <numero entero de 0 a 100>,
  "feedback": "<retroalimentacion breve en espanol, maximo 2-3 oraciones>"
}`;

const CONVERSATIONAL_SYSTEM_PROMPT = `Eres un evaluador experto en conversaciones de atencion al cliente.
Tu tarea es evaluar cada turno del agente dentro de una conversacion multi-turno.

Criterios clave para evaluar cada turno:
1) Fidelidad al expectedResponse del turno actual.
2) Conservacion del contexto conversacional previo sin contradicciones.
3) Utilidad progresiva: el turno debe acercar al usuario a resolver su consulta.
4) Coherencia con turnos anteriores.

Evalua las mismas 6 dimensiones con escala entera 0-100:
- accuracy
- completeness
- relevance
- coherence
- clarity
- usefulness

Responde UNICAMENTE con un JSON valido:
{
  "accuracy": <entero 0-100>,
  "completeness": <entero 0-100>,
  "relevance": <entero 0-100>,
  "coherence": <entero 0-100>,
  "clarity": <entero 0-100>,
  "usefulness": <entero 0-100>,
  "feedback": "<retroalimentacion breve en espanol para este turno>"
}`;

const META_SYSTEM_PROMPT = `Eres un meta-evaluador experto en evaluacion de agentes de IA para atencion al cliente. Tu tarea es analizar e interpretar exhaustivamente los datos del Panorama General de una metaevaluacion.

Se te proporcionara un resumen estructurado con:
- KPIs generales
- Estadisticas detalladas por evaluador en 6 dimensiones
- Distribucion de puntajes
- Datos de consistencia entre evaluadores

Debes generar un analisis integral en espanol que cubra:
1. Resumen ejecutivo
2. Analisis por dimension
3. Comparacion de evaluadores
4. Patrones identificados
5. Consistencia inter-evaluador
6. Distribucion de calidad
7. Conclusiones y recomendaciones

Responde UNICAMENTE con un JSON valido:
{
  "analysis": "<analisis completo en espanol>",
  "recommendations": [
    "<recomendacion concreta>",
    "<recomendacion accionable>"
  ]
}`;

function normalizeScore(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

export interface EvalRowConfig {
  provider?: LLMProvider;
  apiKey?: string;
  openAiBaseUrl?: string;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

interface ScorePayload {
  accuracy: number;
  completeness: number;
  relevance: number;
  coherence: number;
  clarity: number;
  usefulness: number;
  overallScore: number;
  feedback: string;
}

interface ModelParamSupport {
  temperature: boolean;
  topP: boolean;
  maxTokens: boolean;
}

function getProvider(config?: EvalRowConfig): LLMProvider {
  return config?.provider ?? "openai";
}

function getModelForProvider(provider: LLMProvider, config?: EvalRowConfig): string {
  if (config?.model) return config.model;
  return provider === "gemini" ? defaultGeminiModel : defaultOpenAiModel;
}

function getModelParamSupport(provider: LLMProvider, model: string): ModelParamSupport {
  const normalizedModel = model.toLowerCase();
  if (provider === "gemini") {
    return { temperature: true, topP: true, maxTokens: true };
  }

  const isReasoningModel =
    normalizedModel.startsWith("o1") ||
    normalizedModel.startsWith("o3") ||
    normalizedModel.startsWith("o4") ||
    normalizedModel.startsWith("gpt-5");

  if (isReasoningModel) {
    return { temperature: false, topP: false, maxTokens: true };
  }

  return { temperature: true, topP: true, maxTokens: true };
}

function createOpenAiClient(apiKey?: string, openAiBaseUrl?: string): OpenAI {
  const resolved = apiKey || process.env.OPENAI_API_KEY;
  if (!resolved) {
    throw new Error("No se encontro API key de OpenAI.");
  }
  const isGwMode = Boolean(openAiBaseUrl);
  return new OpenAI({
    apiKey: resolved,
    baseURL: openAiBaseUrl,
    ...(isGwMode && resolved.startsWith("gw_")
      ? {
          defaultHeaders: {
            "x-api-key": resolved,
            "api-key": resolved,
          },
        }
      : {}),
  });
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeGwBaseUrl(baseUrl: string, withV1: boolean): string {
  const trimmed = trimTrailingSlashes(baseUrl.trim());
  if (!trimmed) return trimmed;
  const withoutV1 = trimmed.replace(/\/v1$/i, "");
  return withV1 ? `${withoutV1}/v1` : withoutV1;
}

function getGwBaseCandidates(openAiBaseUrl?: string): { primary?: string; fallback?: string } {
  if (!openAiBaseUrl) return {};
  const trimmed = trimTrailingSlashes(openAiBaseUrl.trim());
  if (!trimmed) return {};
  const hasV1 = /\/v1$/i.test(trimmed);
  const withoutV1 = trimmed.replace(/\/v1$/i, "");
  const withV1 = `${withoutV1}/v1`;
  return {
    primary: hasV1 ? withV1 : withoutV1,
    fallback: hasV1 ? withoutV1 : withV1,
  };
}

function getErrorField(error: unknown, field: string): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  return (error as Record<string, unknown>)[field];
}

function getErrorStatus(error: unknown): number | undefined {
  const status = getErrorField(error, "status");
  return typeof status === "number" ? status : undefined;
}

function getErrorStatusText(error: unknown): string | undefined {
  const direct = getErrorField(error, "statusText");
  if (typeof direct === "string" && direct.trim()) return direct;
  const response = getErrorField(error, "response");
  if (typeof response === "object" && response !== null) {
    const value = (response as Record<string, unknown>).statusText;
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function getErrorRequestUrl(error: unknown): string | undefined {
  const direct = getErrorField(error, "url");
  if (typeof direct === "string" && direct.trim()) return direct;
  const request = getErrorField(error, "request");
  if (typeof request === "object" && request !== null) {
    const value = (request as Record<string, unknown>).url;
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function formatGwFailure(error: unknown, attemptedBaseUrl: string): Error {
  const originalMessage = error instanceof Error ? error.message : String(error);
  const status = getErrorStatus(error);
  const statusText = getErrorStatusText(error);
  const requestUrl = getErrorRequestUrl(error);
  const computedUrl = `${trimTrailingSlashes(attemptedBaseUrl)}/chat/completions`;
  const parts = [
    `OpenAI GW request failed: ${originalMessage}`,
    `url=${requestUrl ?? computedUrl}`,
  ];
  if (status !== undefined) parts.push(`status=${status}`);
  if (statusText) parts.push(`statusText=${statusText}`);
  return new Error(parts.join(" | "));
}

function createGeminiClient(apiKey?: string): GoogleGenerativeAI {
  const resolved = apiKey || process.env.GEMINI_API_KEY;
  if (!resolved) {
    throw new Error("No se encontro API key de Gemini.");
  }
  return new GoogleGenerativeAI(resolved);
}

async function requestWithOpenAi(
  systemPrompt: string,
  userPrompt: string,
  config?: EvalRowConfig
): Promise<Record<string, unknown>> {
  const model = getModelForProvider("openai", config);
  const support = getModelParamSupport("openai", model);

  const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  };

  const reqTemp = config?.temperature ?? 0.2;
  if (support.temperature) params.temperature = reqTemp;
  if (support.topP && config?.topP !== undefined) params.top_p = config.topP;
  if (support.maxTokens && config?.maxTokens !== undefined) params.max_tokens = config.maxTokens;

  const isGwMode = Boolean(config?.openAiBaseUrl);
  const { primary: gwPrimaryBase, fallback: gwFallbackBase } = getGwBaseCandidates(config?.openAiBaseUrl);
  const firstBase = isGwMode ? gwPrimaryBase : config?.openAiBaseUrl;

  const requestOnce = async (baseURL?: string): Promise<Record<string, unknown>> => {
    const client = createOpenAiClient(config?.apiKey, baseURL);
    const response = await client.chat.completions.create(params);
    const content = response.choices[0].message.content || "{}";
    return JSON.parse(content) as Record<string, unknown>;
  };

  try {
    return await requestOnce(firstBase);
  } catch (firstError) {
    const firstStatus = getErrorStatus(firstError);
    if (isGwMode) {
      console.error(
        `[OpenAI GW] Primary request failed | baseURL=${firstBase} | status=${firstStatus ?? "N/A"} | ${firstError instanceof Error ? firstError.message : String(firstError)}`,
      );
    }
    if (isGwMode && firstStatus === 404 && gwFallbackBase) {
      try {
        return await requestOnce(gwFallbackBase);
      } catch (fallbackError) {
        console.error(
          `[OpenAI GW] Fallback request failed | baseURL=${gwFallbackBase} | status=${getErrorStatus(fallbackError) ?? "N/A"} | ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        );
        throw formatGwFailure(fallbackError, gwFallbackBase);
      }
    }
    if (isGwMode && gwPrimaryBase) {
      throw formatGwFailure(firstError, gwPrimaryBase);
    }
    throw firstError;
  }
}

async function requestWithGemini(
  systemPrompt: string,
  userPrompt: string,
  config?: EvalRowConfig
): Promise<Record<string, unknown>> {
  const model = getModelForProvider("gemini", config);
  const support = getModelParamSupport("gemini", model);

  const generationConfig: {
    responseMimeType: string;
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
  } = {
    responseMimeType: "application/json",
  };

  const reqTemp = config?.temperature ?? 0.2;
  if (support.temperature) generationConfig.temperature = reqTemp;
  if (support.topP && config?.topP !== undefined) generationConfig.topP = config.topP;
  if (support.maxTokens && config?.maxTokens !== undefined) {
    generationConfig.maxOutputTokens = config.maxTokens;
  }

  const client = createGeminiClient(config?.apiKey);
  const geminiModel = client.getGenerativeModel({ model, generationConfig });
  const result = await geminiModel.generateContent([
    { text: `Instrucciones del sistema:\n${systemPrompt}` },
    { text: `Solicitud del usuario:\n${userPrompt}` },
  ]);

  const text = result.response.text() || "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

function buildOneShotPrompt(row: EvaluationRow): string {
  return `**Pregunta del usuario:**
${row.question}

**Respuesta esperada (correcta):**
${row.expectedResponse}

**Respuesta real del agente:**
${row.actualResponse}

Evalua la respuesta real del agente comparandola con la respuesta esperada.`;
}

function formatTurnHistory(turns: ConversationTurn[], limit: number): string {
  if (limit === 0) return "Sin historial previo.";
  return turns
    .slice(0, limit)
    .map(
      (turn, index) =>
        `Turno ${index + 1}\nPregunta: ${turn.question}\nEsperada: ${turn.expectedResponse}\nReal: ${turn.actualResponse}`
    )
    .join("\n\n");
}

function buildConversationTurnPrompt(turns: ConversationTurn[], turnIndex: number): string {
  const currentTurn = turns[turnIndex];
  const previousHistory = formatTurnHistory(turns, turnIndex);
  return `Se evaluara el turno ${turnIndex + 1} de ${turns.length}.

**Historial previo (turnos anteriores):**
${previousHistory}

**Turno actual - pregunta del usuario:**
${currentTurn.question}

**Turno actual - respuesta esperada:**
${currentTurn.expectedResponse}

**Turno actual - respuesta real del agente:**
${currentTurn.actualResponse}

Evalua SOLO el turno actual, considerando el contexto previo para detectar consistencia, continuidad y utilidad conversacional.`;
}

async function requestScorePayload(
  systemPrompt: string,
  userPrompt: string,
  config?: EvalRowConfig
): Promise<ScorePayload> {
  const provider = getProvider(config);
  const parsed =
    provider === "gemini"
      ? await requestWithGemini(systemPrompt, userPrompt, config)
      : await requestWithOpenAi(systemPrompt, userPrompt, config);

  const accuracy = normalizeScore(parsed.accuracy);
  const completeness = normalizeScore(parsed.completeness);
  const relevance = normalizeScore(parsed.relevance);
  const coherence = normalizeScore(parsed.coherence);
  const clarity = normalizeScore(parsed.clarity);
  const usefulness = normalizeScore(parsed.usefulness);

  return {
    accuracy,
    completeness,
    relevance,
    coherence,
    clarity,
    usefulness,
    overallScore:
      Math.round(((accuracy + completeness + relevance + coherence + clarity + usefulness) / 6) * 10) / 10,
    feedback: String(parsed.feedback ?? "No se pudo generar retroalimentacion."),
  };
}

function aggregateTurnScores(turnScores: ScorePayload[]): ScorePayload {
  const avgInt = (vals: number[]) =>
    vals.length > 0 ? Math.round(vals.reduce((sum, value) => sum + value, 0) / vals.length) : 0;

  const accuracy = avgInt(turnScores.map((score) => score.accuracy));
  const completeness = avgInt(turnScores.map((score) => score.completeness));
  const relevance = avgInt(turnScores.map((score) => score.relevance));
  const coherence = avgInt(turnScores.map((score) => score.coherence));
  const clarity = avgInt(turnScores.map((score) => score.clarity));
  const usefulness = avgInt(turnScores.map((score) => score.usefulness));

  const lowestTurn = turnScores
    .map((score, index) => ({ index, overall: score.overallScore }))
    .sort((a, b) => a.overall - b.overall)[0];
  const strongestTurn = turnScores
    .map((score, index) => ({ index, overall: score.overallScore }))
    .sort((a, b) => b.overall - a.overall)[0];

  return {
    accuracy,
    completeness,
    relevance,
    coherence,
    clarity,
    usefulness,
    overallScore:
      Math.round(((accuracy + completeness + relevance + coherence + clarity + usefulness) / 6) * 10) / 10,
    feedback:
      turnScores.length === 0
        ? "No se pudo evaluar la conversacion."
        : `Conversacion evaluada en ${turnScores.length} turnos. Mejor desempeno en turno ${strongestTurn.index + 1} y mayor oportunidad de mejora en turno ${lowestTurn.index + 1}.`,
  };
}

export async function evaluateRow(
  row: EvaluationRow,
  index: number,
  config?: EvalRowConfig
): Promise<EvaluationResult> {
  const userPrompt = buildOneShotPrompt(row);
  const scores = await requestScorePayload(SYSTEM_PROMPT, userPrompt, config);

  return {
    index,
    ...scores,
  };
}

export async function evaluateConversationRow(
  row: ConversationEvaluationRow,
  index: number,
  config?: EvalRowConfig
): Promise<EvaluationResult> {
  const turns = row.conversationTurns ?? [];
  if (turns.length === 0) {
    return evaluateRow(row, index, config);
  }

  const perTurnScores: ScorePayload[] = [];
  for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
    const userPrompt = buildConversationTurnPrompt(turns, turnIndex);
    const score = await requestScorePayload(CONVERSATIONAL_SYSTEM_PROMPT, userPrompt, config);
    perTurnScores.push(score);
  }

  const aggregate = aggregateTurnScores(perTurnScores);
  return {
    index,
    ...aggregate,
  };
}

export interface MetaAnalyzeResult {
  analysis: string;
  recommendations: string[];
}

export async function metaAnalyze(
  summaryText: string,
  config?: EvalRowConfig
): Promise<MetaAnalyzeResult> {
  const adjustedConfig: EvalRowConfig = {
    ...config,
    temperature: config?.temperature ?? 0.3,
  };

  const provider = getProvider(adjustedConfig);
  const parsed =
    provider === "gemini"
      ? await requestWithGemini(META_SYSTEM_PROMPT, summaryText, adjustedConfig)
      : await requestWithOpenAi(META_SYSTEM_PROMPT, summaryText, adjustedConfig);

  return {
    analysis: String(parsed.analysis ?? "No se pudo generar el analisis."),
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.map((item: unknown) => String(item).trim()).filter(Boolean)
      : [],
  };
}
