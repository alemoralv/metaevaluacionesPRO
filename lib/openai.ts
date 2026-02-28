import OpenAI from "openai";
import { EvaluationRow, EvaluationResult } from "./types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const defaultModel = process.env.OPENAI_MODEL || "gpt-4o-mini";

const SYSTEM_PROMPT = `Eres un evaluador experto de respuestas de agentes de IA para atención al cliente. Tu tarea es comparar la respuesta real de un agente con la respuesta esperada y calificar la calidad.

Evalúa en 6 dimensiones con puntaje de 0 a 100:
- accuracy (Precisión): ¿La respuesta real es factualmente correcta comparada con la respuesta esperada? ¿Da la misma información clave?
- completeness (Completitud): ¿La respuesta cubre todos los puntos clave de la respuesta esperada? ¿Omitió algo importante?
- relevance (Relevancia): ¿La respuesta se mantiene en tema, es útil y no incluye información incorrecta o inventada?
- coherence (Coherencia): ¿La respuesta está lógicamente estructurada y es internamente consistente? ¿Fluye de manera natural?
- clarity (Claridad): ¿La respuesta es clara, fácil de entender y está bien articulada?
- usefulness (Utilidad): ¿La respuesta es práctica, útil y accionable para el usuario? ¿Le ayuda a resolver su problema?

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta:
{
  "accuracy": <número entero de 0 a 100>,
  "completeness": <número entero de 0 a 100>,
  "relevance": <número entero de 0 a 100>,
  "coherence": <número entero de 0 a 100>,
  "clarity": <número entero de 0 a 100>,
  "usefulness": <número entero de 0 a 100>,
  "feedback": "<retroalimentación breve en español, máximo 2-3 oraciones>"
}`;

export interface EvalRowConfig {
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export async function evaluateRow(
  row: EvaluationRow,
  index: number,
  config?: EvalRowConfig
): Promise<EvaluationResult> {
  const userPrompt = `**Pregunta del usuario:**
${row.question}

**Respuesta esperada (correcta):**
${row.expectedResponse}

**Respuesta real del agente:**
${row.actualResponse}

Evalúa la respuesta real del agente comparándola con la respuesta esperada.`;

  const reqModel = config?.model || defaultModel;
  const reqTemp = config?.temperature ?? 0.2;
  const reqTopP = config?.topP;
  const reqMaxTokens = config?.maxTokens;

  const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model: reqModel,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: reqTemp,
  };
  if (reqTopP !== undefined) params.top_p = reqTopP;
  if (reqMaxTokens !== undefined) params.max_tokens = reqMaxTokens;

  const response = await openai.chat.completions.create(params);

  const content = response.choices[0].message.content || "{}";
  const parsed = JSON.parse(content);

  const accuracy = Math.min(100, Math.max(0, parsed.accuracy ?? 0));
  const completeness = Math.min(100, Math.max(0, parsed.completeness ?? 0));
  const relevance = Math.min(100, Math.max(0, parsed.relevance ?? 0));
  const coherence = Math.min(100, Math.max(0, parsed.coherence ?? 0));
  const clarity = Math.min(100, Math.max(0, parsed.clarity ?? 0));
  const usefulness = Math.min(100, Math.max(0, parsed.usefulness ?? 0));

  return {
    index,
    accuracy,
    completeness,
    relevance,
    coherence,
    clarity,
    usefulness,
    overallScore:
      Math.round(((accuracy + completeness + relevance + coherence + clarity + usefulness) / 6) * 10) / 10,
    feedback: parsed.feedback ?? "No se pudo generar retroalimentación.",
  };
}

const META_SYSTEM_PROMPT = `Eres un meta-evaluador experto en evaluación de agentes de IA para atención al cliente. Tu tarea es analizar e interpretar exhaustivamente los datos del Panorama General de una metaevaluación.

Se te proporcionará un resumen estructurado con:
- KPIs generales (preguntas evaluadas, promedio global, mejor/peor evaluador)
- Estadísticas detalladas por evaluador en 6 dimensiones (Precisión, Completitud, Relevancia, Coherencia, Claridad, Utilidad) + General
- Distribución de puntajes (bajo/medio/alto)
- Datos de consistencia entre evaluadores (desviaciones estándar)

Debes generar un análisis integral en español que cubra:
1. **Resumen ejecutivo**: Visión general del rendimiento de los evaluadores
2. **Análisis por dimensión**: Fortalezas y debilidades en cada una de las 6 dimensiones
3. **Comparación de evaluadores**: Qué evaluadores son más estrictos/generosos, cuáles son más consistentes
4. **Patrones identificados**: Tendencias, anomalías o sesgos observados
5. **Consistencia inter-evaluador**: Interpretación de las desviaciones estándar
6. **Distribución de calidad**: Análisis de la proporción de respuestas bajas/medias/altas
7. **Conclusiones y recomendaciones**: Hallazgos clave y sugerencias de mejora

Responde ÚNICAMENTE con un JSON válido:
{
  "analysis": "<análisis completo en español, usando saltos de línea para separar secciones. Usa ## para títulos de sección y ** para negritas.>"
}`;

export async function metaAnalyze(
  summaryText: string,
  config?: EvalRowConfig
): Promise<string> {
  const reqModel = config?.model || defaultModel;
  const reqTemp = config?.temperature ?? 0.3;

  const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model: reqModel,
    messages: [
      { role: "system", content: META_SYSTEM_PROMPT },
      { role: "user", content: summaryText },
    ],
    response_format: { type: "json_object" },
    temperature: reqTemp,
  };

  const response = await openai.chat.completions.create(params);
  const content = response.choices[0].message.content || "{}";
  const parsed = JSON.parse(content);

  return parsed.analysis ?? "No se pudo generar el análisis.";
}
