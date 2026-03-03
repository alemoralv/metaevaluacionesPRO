import OpenAI from "openai";
import { EvaluationRow, EvaluationResult } from "./types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const defaultModel = process.env.OPENAI_MODEL || "gpt-4o-mini";

const SYSTEM_PROMPT = `Eres un evaluador experto de respuestas de agentes de IA para atención al cliente.
Tu objetivo principal es medir si la respuesta real (actualResponse) transmite el MISMO SIGNIFICADO y la MISMA INFORMACIÓN clave que la respuesta esperada (expectedResponse).

Principios de evaluación:
1) Prioriza equivalencia semántica e informativa por encima del estilo.
2) No penalices por "echar más rollo" si lo adicional es consistente, no contradice y no inventa hechos.
3) Penaliza fuertemente omisiones de información crítica de expectedResponse (tiempos, condiciones, restricciones, pasos obligatorios, límites, excepciones, etc.).
4) Penaliza fuertemente invenciones/alucinaciones: afirmaciones no sustentadas por expectedResponse o que cambian el sentido.

Guía de penalización sugerida:
- Omisión menor (detalle secundario): -5 a -12 puntos en completeness.
- Omisión relevante (condición/plazo/paso importante): -15 a -30 puntos en completeness y -5 a -15 en accuracy.
- Invención menor no crítica: -10 a -20 puntos en relevance.
- Invención crítica o contradictoria: -25 a -45 puntos en relevance y -10 a -30 en accuracy.
- Si conserva significado + cobertura completa + sin invenciones: puntajes altos (90-100).

Evalúa en 6 dimensiones con puntaje de 0 a 100:
- accuracy (Precisión): fidelidad factual y semántica respecto a expectedResponse.
- completeness (Completitud): cobertura de TODOS los puntos clave esperados, sin omisiones relevantes.
- relevance (Relevancia): utilidad y enfoque en el tema, sin información inventada o incorrecta.
- coherence (Coherencia): estructura lógica y consistencia interna.
- clarity (Claridad): facilidad de comprensión y redacción.
- usefulness (Utilidad): valor práctico para resolver la consulta del usuario.

Escala:
- Debes usar números enteros entre 0 y 100.
- Puedes usar CUALQUIER entero; evita redondear por hábito a múltiplos de 5.

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

function normalizeScore(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

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

  const accuracy = normalizeScore(parsed.accuracy);
  const completeness = normalizeScore(parsed.completeness);
  const relevance = normalizeScore(parsed.relevance);
  const coherence = normalizeScore(parsed.coherence);
  const clarity = normalizeScore(parsed.clarity);
  const usefulness = normalizeScore(parsed.usefulness);

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
  "analysis": "<análisis completo en español, usando saltos de línea para separar secciones. Usa ## para títulos de sección y ** para negritas.>",
  "recommendations": [
    "<recomendación concreta para ajustar configuración del agente evaluado>",
    "<recomendación concreta y accionable>"
  ]
}`;

export interface MetaAnalyzeResult {
  analysis: string;
  recommendations: string[];
}

export async function metaAnalyze(
  summaryText: string,
  config?: EvalRowConfig
): Promise<MetaAnalyzeResult> {
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

  return {
    analysis: parsed.analysis ?? "No se pudo generar el análisis.",
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.map((item: unknown) => String(item).trim()).filter(Boolean)
      : [],
  };
}
