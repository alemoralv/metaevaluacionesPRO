import OpenAI from "openai";
import {
  ConversationEvaluationRow,
  ConversationTurn,
  EvaluationRow,
  EvaluationResult,
} from "./types";

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

Evalúa en 6 dimensiones con puntaje de 0 a 100. Cada dimensión tiene su propia guía de penalización y rúbrica:

─────────────────────────────────────
1. accuracy (Precisión): fidelidad factual y semántica respecto a expectedResponse.

Penalizaciones:
- Omisión relevante que altera fidelidad factual: -5 a -15 en accuracy.
- Invención menor que introduce dato incorrecto: -10 a -20 en accuracy.
- Invención crítica o contradictoria que cambia el sentido: -20 a -30 en accuracy.

Rúbrica:
- 81-100: La respuesta conserva el mismo significado factual que expectedResponse. No hay invenciones ni contradicciones. Diferencias de estilo o extensión no se penalizan.
- 61-80: Significado general correcto, pero con 1-2 imprecisiones menores o una omisión que afecta parcialmente la fidelidad factual.
- 41-60: Errores factuales notables o invenciones no críticas que desvían parcialmente el sentido. Parte de la información es correcta pero no completamente confiable.
- 21-40: Invenciones críticas o contradictorias que cambian el sentido. Varios datos incorrectos o no sustentados por expectedResponse.
- 0-20: Contradice abiertamente expectedResponse o la información factual es mayoritariamente inventada/incorrecta. No hay equivalencia semántica.

─────────────────────────────────────
2. completeness (Completitud): cobertura de TODOS los puntos clave esperados, sin omisiones relevantes.

Penalizaciones:
- Omisión menor (detalle secundario): -5 a -12 en completeness.
- Omisión relevante (condición, plazo, paso importante): -15 a -30 en completeness.
- Múltiples omisiones relevantes acumulan penalización.

Rúbrica:
- 81-100: Todos los puntos clave de expectedResponse cubiertos (tiempos, condiciones, restricciones, pasos obligatorios, límites, excepciones). Solo podrían faltar detalles secundarios triviales.
- 61-80: Cubre la mayoría de puntos clave, pero omite 1-2 detalles secundarios. La información principal está presente.
- 41-60: Falta al menos una condición, plazo o paso importante de expectedResponse. El usuario obtendría información incompleta para actuar.
- 21-40: Varias omisiones relevantes: faltan múltiples condiciones, restricciones o pasos obligatorios. Cubre el tema solo superficialmente.
- 0-20: Apenas toca el tema o ignora la mayoría de los puntos clave. Equivale a una respuesta vacía o genérica.

─────────────────────────────────────
3. relevance (Relevancia): enfoque en el tema y ausencia de información inventada o incorrecta.

Penalizaciones:
- Contenido tangencial que no aporta a la consulta: -5 a -10 en relevance.
- Invención menor no crítica: -10 a -20 en relevance.
- Invención crítica o contradictoria: -25 a -45 en relevance.

Rúbrica:
- 81-100: La respuesta está enfocada en el tema de la pregunta. No hay información inventada ni incorrecta. Todo lo dicho es pertinente.
- 61-80: Enfocada en el tema, pero incluye algún contenido tangencial o una invención menor no crítica que no altera el sentido global.
- 41-60: Contiene invenciones notables o información no sustentada por expectedResponse. Parte del contenido se desvía del tema o introduce datos dudosos.
- 21-40: Invenciones críticas o contradictorias presentes. Mezcla información correcta con afirmaciones falsas que confunden al usuario.
- 0-20: Mayoritariamente irrelevante: habla de otro tema o está plagada de información inventada sin relación con la pregunta.

─────────────────────────────────────
4. coherence (Coherencia): estructura lógica y consistencia interna de la respuesta.

Penalizaciones:
- Salto menor entre ideas o repetición leve: -5 a -12 en coherence.
- Desorganización parcial o contradicción interna no grave: -15 a -25 en coherence.
- Contradicciones internas importantes o estructura caótica: -25 a -40 en coherence.

Rúbrica:
- 81-100: Las ideas fluyen con orden lógico claro. No hay contradicciones internas. Cada punto sigue naturalmente al anterior.
- 61-80: Estructura generalmente lógica, pero con algún salto menor entre ideas o una leve repetición que no llega a contradecir.
- 41-60: Desorganización parcial: ideas presentadas sin hilo conductor claro, o afirmaciones que se contradicen entre sí de forma no grave.
- 21-40: Se contradice internamente en puntos importantes o salta entre temas sin conexión lógica. Difícil seguir el razonamiento.
- 0-20: Incoherente: sin estructura reconocible, se contradice abiertamente o son fragmentos inconexos.

─────────────────────────────────────
5. clarity (Claridad): facilidad de comprensión y calidad de redacción.

Penalizaciones:
- Una frase confusa o uso innecesario de jerga técnica: -5 a -12 en clarity.
- Varias frases ambiguas que requieren releer: -15 a -25 en clarity.
- Redacción difícil de seguir con errores gramaticales significativos: -25 a -40 en clarity.

Rúbrica:
- 81-100: Redacción clara, directa y fácil de entender para el usuario final. Vocabulario apropiado para atención al cliente. Sin ambigüedades.
- 61-80: Comprensible en general, pero con alguna frase confusa o vocabulario innecesariamente técnico. El mensaje principal se entiende.
- 41-60: Varias frases ambiguas o redacción torpe que requiere releer. El usuario podría malinterpretar partes de la respuesta.
- 21-40: Difícil de seguir: oraciones muy largas, confusas o con errores gramaticales significativos que oscurecen el mensaje.
- 0-20: Incomprensible o ilegible: el usuario no podría extraer información útil de la redacción presentada.

─────────────────────────────────────
6. usefulness (Utilidad): valor práctico para resolver la consulta del usuario.

Penalizaciones:
- Falta un detalle práctico (enlace, plazo, paso concreto): -5 a -15 en usefulness.
- Solo orientación parcial; el usuario necesita ayuda adicional significativa: -15 a -30 en usefulness.
- Información genérica o vaga sin valor accionable: -30 a -50 en usefulness.

Rúbrica:
- 81-100: Da al usuario todo lo necesario para actuar: pasos, condiciones, plazos. Resuelve la consulta de forma práctica y accionable.
- 61-80: Resuelve la consulta en lo esencial, pero falta algún detalle práctico (enlace, paso concreto, plazo) que el usuario tendría que buscar por su cuenta.
- 41-60: Aporta orientación parcial pero insuficiente para resolver el problema sin ayuda adicional.
- 21-40: Poco útil: información genérica o vaga que no ayuda al usuario a avanzar en la resolución de su consulta.
- 0-20: Sin valor práctico: no aporta nada útil para resolver el problema. Podría incluso confundir o llevar por un camino incorrecto.

─────────────────────────────────────
Penalizaciones cruzadas entre dimensiones:
- Una omisión relevante, además de penalizar completeness (-15 a -30), también puede penalizar accuracy (-5 a -15) y usefulness (-5 a -15).
- Una invención crítica, además de penalizar relevance (-25 a -45), también puede penalizar accuracy (-10 a -30) y usefulness (-10 a -20).
- Si conserva significado + cobertura completa + sin invenciones: puntajes altos (90-100) en todas las dimensiones.

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

const CONVERSATIONAL_SYSTEM_PROMPT = `Eres un evaluador experto en conversaciones de atención al cliente.
Tu tarea es evaluar cada turno del agente dentro de una conversación multi-turno.

Criterios clave para evaluar cada turno:
1) Fidelidad al expectedResponse del turno actual.
2) Conservación del contexto conversacional previo sin contradicciones.
3) Utilidad progresiva: el turno debe acercar al usuario a resolver su consulta.
4) Coherencia con turnos anteriores (no repetir ni desviar innecesariamente).

Evalúa las mismas 6 dimensiones con escala entera 0-100:
- accuracy
- completeness
- relevance
- coherence
- clarity
- usefulness

Responde ÚNICAMENTE con un JSON válido:
{
  "accuracy": <entero 0-100>,
  "completeness": <entero 0-100>,
  "relevance": <entero 0-100>,
  "coherence": <entero 0-100>,
  "clarity": <entero 0-100>,
  "usefulness": <entero 0-100>,
  "feedback": "<retroalimentación breve en español para este turno>"
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

function buildOneShotPrompt(row: EvaluationRow): string {
  return `**Pregunta del usuario:**
${row.question}

**Respuesta esperada (correcta):**
${row.expectedResponse}

**Respuesta real del agente:**
${row.actualResponse}

Evalúa la respuesta real del agente comparándola con la respuesta esperada.`;
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
  return `Se evaluará el turno ${turnIndex + 1} de ${turns.length}.

**Historial previo (turnos anteriores):**
${previousHistory}

**Turno actual - pregunta del usuario:**
${currentTurn.question}

**Turno actual - respuesta esperada:**
${currentTurn.expectedResponse}

**Turno actual - respuesta real del agente:**
${currentTurn.actualResponse}

Evalúa SOLO el turno actual, considerando el contexto previo para detectar consistencia, continuidad y utilidad conversacional.`;
}

async function requestScorePayload(
  systemPrompt: string,
  userPrompt: string,
  config?: EvalRowConfig
): Promise<ScorePayload> {
  const reqModel = config?.model || defaultModel;
  const reqTemp = config?.temperature ?? 0.2;
  const reqTopP = config?.topP;
  const reqMaxTokens = config?.maxTokens;

  const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model: reqModel,
    messages: [
      { role: "system", content: systemPrompt },
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
        ? "No se pudo evaluar la conversación."
        : `Conversación evaluada en ${turnScores.length} turnos. Mejor desempeño en turno ${strongestTurn.index + 1} y mayor oportunidad de mejora en turno ${lowestTurn.index + 1}.`,
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
    const score = await requestScorePayload(
      CONVERSATIONAL_SYSTEM_PROMPT,
      userPrompt,
      config
    );
    perTurnScores.push(score);
  }

  const aggregate = aggregateTurnScores(perTurnScores);
  return {
    index,
    ...aggregate,
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
