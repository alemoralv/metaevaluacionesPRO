import { NextRequest, NextResponse } from "next/server";
import { metaAnalyze, EvalRowConfig } from "@/lib/openai";
import { LLMProvider } from "@/lib/types";
import { resolveAuthFromHeaders } from "@/lib/auth";

export const maxDuration = 60;

interface MetaAnalyzeBody {
  summary: string;
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

  try {
    const result = await metaAnalyze(body.summary, effectiveConfig);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: `Error en meta-análisis: ${err instanceof Error ? err.message : "Error desconocido"}` },
      { status: 500 }
    );
  }
}
