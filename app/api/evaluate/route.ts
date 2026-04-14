import { NextRequest, NextResponse } from "next/server";
import { evaluateConversationRow, evaluateRow, EvalRowConfig } from "@/lib/openai";
import { ConversationEvaluationRow, EvaluationMode, EvaluationRow, LLMProvider } from "@/lib/types";
import { resolveAuthFromHeaders } from "@/lib/auth";

export const maxDuration = 60;

interface EvaluateBody {
  mode?: EvaluationMode;
  rows: EvaluationRow[];
  llmConfig?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
  };
}

export async function POST(request: NextRequest) {
  const authResult = resolveAuthFromHeaders(request.headers);
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: EvaluateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON inválido" },
      { status: 400 }
    );
  }

  if (!body.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json(
      { error: "No se proporcionaron filas para evaluar" },
      { status: 400 }
    );
  }

  const config: EvalRowConfig | undefined = body.llmConfig
    ? {
        provider: body.llmConfig.provider,
        model: body.llmConfig.model,
        temperature: body.llmConfig.temperature,
        topP: body.llmConfig.topP,
        maxTokens: body.llmConfig.maxTokens,
      }
    : undefined;

  const effectiveConfig: EvalRowConfig = {
    ...(config ?? {}),
    provider: authResult.auth.provider,
    apiKey: authResult.auth.apiKey,
    openAiBaseUrl: authResult.auth.gwBaseUrl,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < body.rows.length; i++) {
        try {
          const row = body.rows[i];
          const result =
            body.mode === "conversational"
              ? await evaluateConversationRow(row as ConversationEvaluationRow, i, effectiveConfig)
              : await evaluateRow(row, i, effectiveConfig);
          controller.enqueue(encoder.encode(JSON.stringify(result) + "\n"));
        } catch (err) {
          const errorResult = {
            index: i,
            accuracy: 0,
            completeness: 0,
            relevance: 0,
            coherence: 0,
            clarity: 0,
            usefulness: 0,
            overallScore: 0,
            feedback: `Error al evaluar: ${err instanceof Error ? err.message : "Error desconocido"}`,
          };
          controller.enqueue(
            encoder.encode(JSON.stringify(errorResult) + "\n")
          );
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}
