import { NextRequest, NextResponse } from "next/server";
import { evaluateRow, EvalRowConfig } from "@/lib/openai";
import { EvaluationRow } from "@/lib/types";

export const maxDuration = 60;

interface EvaluateBody {
  rows: EvaluationRow[];
  llmConfig?: {
    model?: string;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
  };
}

export async function POST(request: NextRequest) {
  const accessKey = request.headers.get("x-access-key");
  if (accessKey !== process.env.ACCESS_KEY) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
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
        model: body.llmConfig.model,
        temperature: body.llmConfig.temperature,
        topP: body.llmConfig.topP,
        maxTokens: body.llmConfig.maxTokens,
      }
    : undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < body.rows.length; i++) {
        try {
          const result = await evaluateRow(body.rows[i], i, config);
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
