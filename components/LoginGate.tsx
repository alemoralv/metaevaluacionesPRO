"use client";

import { useState, FormEvent } from "react";
import logoProfuturo from "@/profuturologo.png";
import { ClientAuthSession, LLMProvider } from "@/lib/types";

interface LoginGateProps {
  onLogin: (session: ClientAuthSession) => void;
}

export default function LoginGate({ onLogin }: LoginGateProps) {
  const [provider, setProvider] = useState<LLMProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminMode, setAdminMode] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (adminMode) {
      if (!adminPassword.trim()) {
        setError("Ingresa la contraseña de Admin");
        return;
      }
      if (adminPassword !== "Am16037361") {
        setError("Contraseña de Admin incorrecta");
        return;
      }
      setSubmitting(true);
      setError("");
      onLogin({
        mode: "admin",
        provider: "openai",
        adminPassword: adminPassword.trim(),
      });
      setSubmitting(false);
      return;
    }

    if (!apiKey.trim()) {
      setError("Ingresa tu API key para continuar");
      return;
    }

    setSubmitting(true);
    setError("");
    onLogin({
      mode: "user",
      provider,
      apiKey: apiKey.trim(),
    });
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-white">
      <div className="w-full max-w-sm">
        <div className="relative text-center mb-8">
          <div
            className="pointer-events-none absolute left-1/2 top-[-180px] h-[22rem] w-[40rem] -translate-x-1/2 overflow-hidden opacity-15"
          >
            <div
              className="h-full w-full bg-no-repeat"
              style={{
                backgroundImage: `url(${logoProfuturo.src})`,
                backgroundPosition: "center 0",
                backgroundSize: "1120px auto",
              }}
            />
          </div>
          <h1 className="relative z-10 text-2xl font-semibold tracking-tight">
            MetaEvaluaciones PRO
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Evaluación automática de respuestas de IA
          </p>
          <p className="text-xs text-gray-400 mt-1">
            by{" "}
            <a
              href="https://alemoralv.github.io/alemoralv/#home"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-600 underline decoration-gray-300 hover:decoration-gray-500 transition-colors"
            >
              alemoralv
            </a>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!adminMode && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Proveedor
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as LLMProvider)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
                >
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Gemini</option>
                </select>
              </div>

              <div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`API key de ${provider === "openai" ? "OpenAI" : "Gemini"}`}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
                  autoFocus
                />
              </div>
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                Tu API key no se guarda en ningún lado. Solo se usa en memoria durante
                esta sesión y se elimina al recargar o cerrar la pestaña.
              </p>
            </>
          )}

          {adminMode && (
            <div>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Contraseña de Admin"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-2">
                Modo Admin usa la API key en `.env` y solo habilita OpenAI.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Validando..." : adminMode ? "Entrar como Admin" : "Ingresar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdminMode((prev) => !prev);
                setError("");
              }}
              className="w-full py-3 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              {adminMode ? "Volver" : "Admin"}
            </button>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}
