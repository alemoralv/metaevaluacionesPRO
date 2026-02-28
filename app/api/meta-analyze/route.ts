import { NextRequest, NextResponse } from "next/server";
import { metaAnalyze, EvalRowConfig } from "@/lib/openai";

export const maxDuration = 60;

interface MetaAnalyzeBody {
  summary: string;
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

  let body: MetaAnalyzeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON inválido" },
      { status: 400 }
    );
  }

  if (!body.summary || typeof body.summary !== "string") {
    return NextResponse.json(
      { error: "No se proporcionó resumen para analizar" },
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

  try {
    const analysis = await metaAnalyze(body.summary, config);
    return NextResponse.json({ analysis });
  } catch (err) {
    return NextResponse.json(
      { error: `Error en meta-análisis: ${err instanceof Error ? err.message : "Error desconocido"}` },
      { status: 500 }
    );
  }
}
