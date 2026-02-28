"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { AgentReportContext } from "@/lib/types";

interface AgentContextFormProps {
  initialValue?: AgentReportContext | null;
  onSubmit: (context: AgentReportContext) => void;
  disabled?: boolean;
}

const MAX_TXT_SIZE_BYTES = 512_000;

const EMPTY_CONTEXT: AgentReportContext = {
  evaluatorName: "",
  agentName: "",
  modelName: "",
  knowledgeSource: "",
  capabilities: {
    webSearch: false,
    generalKnowledge: false,
    orchestration: false,
    tools: false,
  },
  testPhase: "",
  systemInstructions: "",
};

function yesNoText(value: boolean): string {
  return value ? "si" : "no";
}

export default function AgentContextForm({
  initialValue,
  onSubmit,
  disabled = false,
}: AgentContextFormProps) {
  const [context, setContext] = useState<AgentReportContext>(
    initialValue ?? EMPTY_CONTEXT
  );
  const [txtName, setTxtName] = useState("");
  const [error, setError] = useState("");

  const isValid = useMemo(() => {
    return (
      context.evaluatorName.trim().length > 0 &&
      context.agentName.trim().length > 0 &&
      context.modelName.trim().length > 0 &&
      context.knowledgeSource.trim().length > 0 &&
      context.testPhase.trim().length > 0
    );
  }, [context]);

  const setCapability = (
    key: keyof AgentReportContext["capabilities"],
    value: boolean
  ) => {
    setContext((prev) => ({
      ...prev,
      capabilities: {
        ...prev.capabilities,
        [key]: value,
      },
    }));
  };

  const handleTxtUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setError("");
    setTxtName("");

    if (!file) {
      setContext((prev) => ({ ...prev, systemInstructions: "" }));
      return;
    }

    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("Solo se permite archivo .txt");
      return;
    }

    if (file.size > MAX_TXT_SIZE_BYTES) {
      setError("El archivo .txt supera el limite de 500 KB");
      return;
    }

    const text = await file.text();
    setTxtName(file.name);
    setContext((prev) => ({
      ...prev,
      systemInstructions: text.trim(),
    }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!isValid) {
      setError("Completa los campos obligatorios");
      return;
    }

    onSubmit({
      ...context,
      evaluatorName: context.evaluatorName.trim(),
      agentName: context.agentName.trim(),
      modelName: context.modelName.trim(),
      knowledgeSource: context.knowledgeSource.trim(),
      testPhase: context.testPhase.trim(),
      systemInstructions: context.systemInstructions?.trim() ?? "",
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-medium">Datos del reporte</h2>
        <p className="text-sm text-gray-500 mt-1">
          Esta informacion se incluira en todos los reportes
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Evaluador
            </label>
            <input
              type="text"
              value={context.evaluatorName}
              onChange={(e) =>
                setContext((prev) => ({ ...prev, evaluatorName: e.target.value }))
              }
              placeholder="Alejandro Morera Alvarez"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Agente
            </label>
            <input
              type="text"
              value={context.agentName}
              onChange={(e) =>
                setContext((prev) => ({ ...prev, agentName: e.target.value }))
              }
              placeholder="Helpdesk"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Modelo
            </label>
            <input
              type="text"
              value={context.modelName}
              onChange={(e) =>
                setContext((prev) => ({ ...prev, modelName: e.target.value }))
              }
              placeholder="GPT-5 Chat"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Conocimiento
            </label>
            <input
              type="text"
              value={context.knowledgeSource}
              onChange={(e) =>
                setContext((prev) => ({
                  ...prev,
                  knowledgeSource: e.target.value,
                }))
              }
              placeholder="Manual Actividad PRO"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">
            Parametros adicionales
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <label className="flex items-center justify-between border border-gray-200 rounded-md px-3 py-2">
              <span>Busqueda Web</span>
              <input
                type="checkbox"
                checked={context.capabilities.webSearch}
                onChange={(e) => setCapability("webSearch", e.target.checked)}
                className="h-4 w-4 accent-gray-900"
              />
            </label>
            <label className="flex items-center justify-between border border-gray-200 rounded-md px-3 py-2">
              <span>Conocimiento General</span>
              <input
                type="checkbox"
                checked={context.capabilities.generalKnowledge}
                onChange={(e) =>
                  setCapability("generalKnowledge", e.target.checked)
                }
                className="h-4 w-4 accent-gray-900"
              />
            </label>
            <label className="flex items-center justify-between border border-gray-200 rounded-md px-3 py-2">
              <span>Orquestacion</span>
              <input
                type="checkbox"
                checked={context.capabilities.orchestration}
                onChange={(e) =>
                  setCapability("orchestration", e.target.checked)
                }
                className="h-4 w-4 accent-gray-900"
              />
            </label>
            <label className="flex items-center justify-between border border-gray-200 rounded-md px-3 py-2">
              <span>Herramientas</span>
              <input
                type="checkbox"
                checked={context.capabilities.tools}
                onChange={(e) => setCapability("tools", e.target.checked)}
                className="h-4 w-4 accent-gray-900"
              />
            </label>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Seleccion actual: Busqueda web {yesNoText(context.capabilities.webSearch)}
            , Conocimiento general {yesNoText(context.capabilities.generalKnowledge)}
            , Orquestacion {yesNoText(context.capabilities.orchestration)}, Herramientas{" "}
            {yesNoText(context.capabilities.tools)}
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Fase de prueba
          </label>
          <input
            type="text"
            value={context.testPhase}
            onChange={(e) =>
              setContext((prev) => ({ ...prev, testPhase: e.target.value }))
            }
            placeholder="Unitarias"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Instrucciones del sistema (.txt, opcional)
          </label>
          <input
            type="file"
            accept=".txt,text/plain"
            onChange={handleTxtUpload}
            className="block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-2 file:border-0 file:rounded-md file:bg-gray-900 file:text-white hover:file:bg-gray-800"
          />
          {txtName && (
            <p className="text-xs text-gray-400 mt-1">
              Archivo cargado: {txtName}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={disabled || !isValid}
          className="w-full py-3 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continuar a carga de CSV
        </button>
      </form>
    </div>
  );
}
