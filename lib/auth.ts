import { NextResponse } from "next/server";
import { AuthMode, LLMProvider } from "@/lib/types";

const ADMIN_PASSWORD = "Am16037361";

export interface ServerAuthContext {
  mode: AuthMode;
  provider: LLMProvider;
  apiKey: string;
}

function isProvider(value: string | null): value is LLMProvider {
  return value === "openai" || value === "gemini";
}

export function resolveAuthFromHeaders(
  headers: Headers
): { ok: true; auth: ServerAuthContext } | { ok: false; response: NextResponse } {
  const mode = headers.get("x-auth-mode");

  if (mode === "admin") {
    const adminPassword = headers.get("x-admin-password");
    if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
      return {
        ok: false,
        response: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
      };
    }

    if (!process.env.OPENAI_API_KEY) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "OPENAI_API_KEY no está configurada en el servidor." },
          { status: 500 }
        ),
      };
    }

    return {
      ok: true,
      auth: {
        mode: "admin",
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY,
      },
    };
  }

  if (mode !== "user") {
    return {
      ok: false,
      response: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }

  const provider = headers.get("x-provider");
  if (!isProvider(provider)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Proveedor inválido. Usa openai o gemini." },
        { status: 400 }
      ),
    };
  }

  const apiKey = headers.get("x-user-api-key");
  if (!apiKey || !apiKey.trim()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Falta API key del usuario para continuar." },
        { status: 401 }
      ),
    };
  }

  return {
    ok: true,
    auth: {
      mode: "user",
      provider,
      apiKey: apiKey.trim(),
    },
  };
}
