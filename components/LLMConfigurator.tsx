"use client";

import { useState } from "react";
import { LLMConfig } from "@/lib/types";

interface LLMConfiguratorProps {
  onStart: (configs: LLMConfig[], metaEnabled: boolean) => void;
  disabled: boolean;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

const DEFAULT_CONFIG: () => LLMConfig = () => ({
  id: generateId(),
  model: "gpt-4o-mini",
  temperature: 0.2,
  topP: 1,
});

export default function LLMConfigurator({
  onStart,
  disabled,
}: LLMConfiguratorProps) {
  const [configs, setConfigs] = useState<LLMConfig[]>([DEFAULT_CONFIG()]);
  const [metaEnabled, setMetaEnabled] = useState(false);

  const updateConfig = (id: string, patch: Partial<LLMConfig>) => {
    setConfigs((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  };

  const addConfig = () => {
    setConfigs((prev) => [...prev, DEFAULT_CONFIG()]);
  };

  const removeConfig = (id: string) => {
    if (configs.length <= 1) return;
    setConfigs((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-medium">Configurar evaluadores LLM</h2>
        <p className="text-sm text-gray-500 mt-1">
          Agrega uno o más LLMs con parámetros distintos para comparar sus
          evaluaciones
        </p>
      </div>

      <div className="space-y-4">
        {configs.map((config, idx) => (
          <div
            key={config.id}
            className="border border-gray-200 rounded-lg bg-white p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">
                Evaluador {idx + 1}
              </h3>
              {configs.length > 1 && (
                <button
                  onClick={() => removeConfig(config.id)}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Eliminar
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Modelo
                </label>
                <input
                  type="text"
                  value={config.model}
                  onChange={(e) =>
                    updateConfig(config.id, { model: e.target.value })
                  }
                  placeholder="gpt-4o-mini"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Temperatura ({config.temperature})
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={config.temperature}
                    onChange={(e) =>
                      updateConfig(config.id, {
                        temperature: parseFloat(e.target.value),
                      })
                    }
                    className="flex-1 accent-gray-900"
                  />
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={config.temperature}
                    onChange={(e) =>
                      updateConfig(config.id, {
                        temperature: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Top P ({config.topP})
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={config.topP}
                    onChange={(e) =>
                      updateConfig(config.id, {
                        topP: parseFloat(e.target.value),
                      })
                    }
                    className="flex-1 accent-gray-900"
                  />
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={config.topP}
                    onChange={(e) =>
                      updateConfig(config.id, {
                        topP: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Max Tokens (opcional)
                </label>
                <input
                  type="number"
                  min="1"
                  value={config.maxTokens ?? ""}
                  onChange={(e) =>
                    updateConfig(config.id, {
                      maxTokens: e.target.value
                        ? parseInt(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="Sin límite"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
            </div>

            <p className="text-xs text-gray-400">
              {config.model} (T={config.temperature}, P={config.topP})
            </p>
          </div>
        ))}
      </div>

      <button
        onClick={addConfig}
        className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
      >
        + Agregar evaluador
      </button>

      <div className="border border-gray-200 rounded-lg bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">
              Metaevaluador
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Un LLM adicional evalúa la calidad de las evaluaciones de los demás
            </p>
          </div>
          <button
            onClick={() => setMetaEnabled(!metaEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              metaEnabled ? "bg-gray-900" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                metaEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        {metaEnabled && (
          <p className="text-xs text-gray-400 mt-2">
            Modelo configurado en el servidor (META_EVALUATOR_MODEL)
          </p>
        )}
      </div>

      <button
        onClick={() => onStart(configs, metaEnabled)}
        disabled={disabled || configs.some((c) => !c.model.trim())}
        className="w-full py-3 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Iniciar evaluación con {configs.length} evaluador
        {configs.length !== 1 ? "es" : ""}
      </button>
    </div>
  );
}
