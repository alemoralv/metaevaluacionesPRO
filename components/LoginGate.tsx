"use client";

import { useState, FormEvent } from "react";

interface LoginGateProps {
  onLogin: (key: string) => void;
}

export default function LoginGate({ onLogin }: LoginGateProps) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      setError("Ingresa la clave de acceso");
      return;
    }
    setLoading(true);
    setError("");

    const res = await fetch("/api/evaluate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-access-key": key.trim(),
      },
      body: JSON.stringify({ rows: [] }),
    });

    setLoading(false);

    if (res.status === 401) {
      setError("Clave incorrecta");
      return;
    }

    sessionStorage.setItem("accessKey", key.trim());
    onLogin(key.trim());
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            MetaEvaluaciones PRO
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Evaluación automática de respuestas de IA
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Clave de acceso"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
              autoFocus
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Verificando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
