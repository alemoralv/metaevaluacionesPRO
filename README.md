# MetaEvaluaciones PRO

Aplicación web para **evaluar respuestas de agentes de IA** usando uno o varios LLMs como evaluadores, con análisis comparativo y exportación de reportes (CSV, PDF, LaTeX e infografía).

Este README está orientado a dos públicos:

- **Usuario funcional**: cómo operar la herramienta de punta a punta.
- **Perfil técnico**: arquitectura, APIs, métricas, dependencias y consideraciones operativas.

---

## Contenido

- [Qué hace la plataforma](#qué-hace-la-plataforma)
- [Flujo funcional (lado usuario)](#flujo-funcional-lado-usuario)
- [Formato y reglas del CSV](#formato-y-reglas-del-csv)
- [Métricas, escalas y consistencia](#métricas-escalas-y-consistencia)
- [Exportaciones y entregables](#exportaciones-y-entregables)
- [Requisitos técnicos](#requisitos-técnicos)
- [Instalación y ejecución](#instalación-y-ejecución)
- [Variables de entorno](#variables-de-entorno)
- [Arquitectura técnica](#arquitectura-técnica)
- [Contrato de APIs](#contrato-de-apis)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Operación y troubleshooting](#operación-y-troubleshooting)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Tecnologías](#tecnologías)

---

## Qué hace la plataforma

MetaEvaluaciones PRO permite:

1. Subir un dataset CSV con preguntas, respuesta esperada y respuesta real del agente.
2. Configurar uno o más LLMs evaluadores (modelo, temperatura, top-p, max tokens).
3. Ejecutar evaluación por lotes con actualización de progreso en tiempo real.
4. Comparar evaluadores en tablero de panorama general.
5. Activar un meta-análisis para estudiar consistencia entre evaluadores.
6. Exportar resultados para consumo operativo, ejecutivo y técnico.

---

## Flujo funcional (lado usuario)

La aplicación sigue un flujo de estados:

`login -> context -> upload -> configure -> evaluating -> results`

### 1) Ingreso

- Se solicita una clave de acceso.
- La clave se valida contra backend con header `x-access-key`.
- Si la clave es válida, se guarda en `sessionStorage` para la sesión actual.

### 2) Contexto del reporte

Se completan campos que alimentan los reportes:

- Evaluador
- Agente
- Modelo del agente evaluado
- Base de conocimiento
- Capacidades del agente:
  - Búsqueda web
  - Conocimiento general
  - Orquestación
  - Herramientas
- Fase de prueba
- Instrucciones del sistema (archivo `.txt`, opcional, límite 500 KB)

### 3) Carga del CSV

- Se acepta drag-and-drop o selector de archivo.
- Se valida estructura (columnas obligatorias exactas).
- Se filtran filas vacías o incompletas.

### 4) Configuración de evaluadores LLM

- Se pueden agregar múltiples evaluadores.
- Por evaluador se define:
  - `model`
  - `temperature`
  - `topP`
  - `maxTokens` (opcional)
- Se puede activar el modo metaevaluador para analizar consistencia inter-evaluador.

### 5) Evaluación

- Cada evaluador procesa filas en paralelo.
- Dentro de cada evaluador, se envían lotes de tamaño 10.
- El backend responde en streaming NDJSON para actualizar progreso y resultados de forma incremental.

### 6) Resultados

Se habilitan pestañas:

- **Panorama General**: comparación entre evaluadores, KPIs y distribución.
- **Por evaluador**: gráficas, tabla completa y descarga CSV enriquecido.
- **Análisis meta-evaluador** (si aplica): consistencia y recomendaciones.

---

## Formato y reglas del CSV

El CSV de entrada debe contener **exactamente** estas columnas:

| Columna | Descripción |
|---|---|
| `question` | Pregunta del usuario |
| `expectedResponse` | Respuesta esperada/correcta |
| `actualResponse` | Respuesta real del agente |

Ejemplo:

```csv
question,expectedResponse,actualResponse
"¿Cuál es el plazo de entrega?","El plazo es de 5 días hábiles.","La entrega tarda 5 días hábiles."
"¿Puedo cancelar?","Sí, dentro de 24 horas sin penalización.","Sí, puedes cancelar durante las primeras 24 horas."
```

Reglas aplicadas:

- Si falta una columna requerida, se rechaza el archivo.
- Si una fila viene sin contenido en cualquiera de las tres columnas, se descarta.
- Si no quedan filas válidas tras el filtrado, se muestra error.

---

## Métricas, escalas y consistencia

### Dimensiones evaluadas por respuesta

Cada respuesta se califica en 0 a 100:

- `accuracy` (Precisión)
- `completeness` (Completitud)
- `relevance` (Relevancia)
- `coherence` (Coherencia)
- `clarity` (Claridad)
- `usefulness` (Utilidad)

### Cálculo de score general

- `overallScore` = promedio aritmético de las 6 dimensiones.
- Se redondea a 1 decimal.
- Cada dimensión se normaliza a entero entre 0 y 100.

### Bandas de interpretación

- **Bajo**: `< 40`
- **Medio**: `40-69`
- **Alto**: `>= 70`
- **% Aprobación**: porcentaje de respuestas con `overallScore >= 70`.

### Consistencia inter-evaluador (meta)

Cuando hay más de un evaluador:

- Se calcula desviación estándar poblacional por pregunta y dimensión.
- También se calcula `overallStdDev`.
- Lectura visual:
  - Baja variación: `< 10`
  - Media variación: `<= 20`
  - Alta variación: `> 20`

---

## Exportaciones y entregables

### CSV enriquecido (por evaluador)

Incluye columnas originales más:

`accuracy, completeness, relevance, coherence, clarity, usefulness, overallScore, feedback`

### PDF individual

- Portada y contexto.
- Configuración del evaluador.
- Resumen de puntajes.
- Gráficas capturadas desde UI.
- Conversación detallada (pregunta, respuesta real, esperada, scores, feedback).

### PDF consolidado

- Portada y contexto del agente.
- Configuración de todos los evaluadores.
- Panorama general (gráficas + tablas detalladas).
- Sección de meta-análisis (si aplica).
- Sección individual por cada evaluador.

### PDF tipo diapositivas (2 slides)

Enfoque ejecutivo:

- Slide 1: KPIs globales y configuración.
- Slide 2: comparación visual por dimensión entre evaluadores.

### LaTeX (`.zip`)

- Genera un `.tex` completo + carpeta `assets` con capturas.
- La app no compila TeX internamente.
- Compilación recomendada fuera del sistema (`pdflatex` o equivalente).

### Infografía (PNG descargable)

Flujo real de generación (orden actual):

1. **Plantilla local determinista** (SVG corporativo generado en backend).
2. **Fallback NotebookLM** (solo si `INFOGRAPHIC_ENABLE_NOTEBOOKLM_FALLBACK=1`).
3. **Fallback OpenAI Images** (`gpt-image-1`) si hay `OPENAI_API_KEY`.

En frontend, si llega SVG, se convierte a PNG antes de descargar.

---

## Requisitos técnicos

- Node.js 18+ recomendado.
- npm 9+ recomendado.
- Clave de OpenAI válida para evaluación.
- Para fallback NotebookLM (opcional):
  - `notebooklm` CLI disponible y autenticado.

Requisitos opcionales para flujo NotebookLM:

```bash
pip install "notebooklm-py[browser]"
playwright install chromium
notebooklm login
notebooklm list --json
```

---

## Instalación y ejecución

### 1) Instalar dependencias

```bash
npm install
```

### 2) Configurar variables de entorno

Crear `.env.local` en la raíz:

```env
OPENAI_API_KEY=sk-tu-api-key
ACCESS_KEY=tu-clave-de-acceso
OPENAI_MODEL=gpt-4o-mini
INFOGRAPHIC_ENABLE_NOTEBOOKLM_FALLBACK=0
```

### 3) Ejecutar en local

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

### 4) Build de producción

```bash
npm run build
npm run start
```

---

## Variables de entorno

| Variable | Uso | Requerida |
|---|---|---|
| `OPENAI_API_KEY` | Evaluación de filas y meta-análisis; fallback OpenAI para infografía | Sí |
| `ACCESS_KEY` | Control de acceso simple mediante header `x-access-key` | Sí |
| `OPENAI_MODEL` | Modelo por defecto para evaluación/meta-análisis | No |
| `INFOGRAPHIC_ENABLE_NOTEBOOKLM_FALLBACK` | Activa fallback NotebookLM (`1` activo, otro valor inactivo) | No |

---

## Arquitectura técnica

### Frontend

- Next.js App Router + React Client Components.
- Página principal orquesta estado de flujo, progreso, tabs, descargas y llamadas a API.
- Componentes especializados:
  - Login
  - Contexto del reporte
  - Uploader CSV
  - Configuración LLM
  - Visualización de resultados
  - Panel comparativo
  - Panel meta-evaluador

### Backend (API Routes)

- `POST /api/evaluate`
  - valida acceso
  - evalúa cada fila con OpenAI
  - responde en `application/x-ndjson` para streaming
- `POST /api/meta-analyze`
  - valida acceso
  - analiza panorama consolidado con LLM
- `POST /api/infographic`
  - valida acceso
  - genera infografía por plantilla local + fallbacks

### Librerías de dominio (`lib/`)

- `openai.ts`: prompts, normalización de scores, evaluación y meta-análisis.
- `consistency.ts`: desviación estándar por dimensión/pregunta.
- `pdfGenerator.ts`: generación de PDF individual, consolidado y slides.
- `texGenerator.ts`: armado de reporte `.tex` y empaquetado zip.
- `infographic.ts`: payload e instrucciones para infografía.
- `infographicLocalRenderer.ts`: render SVG corporativo local.
- `types.ts`: contratos TypeScript compartidos.

---

## Contrato de APIs

## `POST /api/evaluate`

Headers:

- `Content-Type: application/json`
- `x-access-key: <ACCESS_KEY>`

Body:

```json
{
  "rows": [
    {
      "question": "string",
      "expectedResponse": "string",
      "actualResponse": "string"
    }
  ],
  "llmConfig": {
    "model": "gpt-4o-mini",
    "temperature": 0.2,
    "topP": 1,
    "maxTokens": 800
  }
}
```

Respuesta:

- Streaming NDJSON (una línea JSON por resultado).

## `POST /api/meta-analyze`

Headers:

- `Content-Type: application/json`
- `x-access-key: <ACCESS_KEY>`

Body:

```json
{
  "summary": "texto consolidado del panorama general",
  "llmConfig": {
    "model": "gpt-4o-mini",
    "temperature": 0.3
  }
}
```

Respuesta:

```json
{
  "analysis": "texto markdown-like",
  "recommendations": ["...", "..."]
}
```

## `POST /api/infographic`

Headers:

- `Content-Type: application/json`
- `x-access-key: <ACCESS_KEY>`

Body:

```json
{
  "payload": {
    "reportContext": {},
    "kpis": {},
    "dimensions": []
  }
}
```

Respuesta:

- `image/svg+xml` (render local), o
- `image/png` (fallback NotebookLM/OpenAI), o
- error JSON 4xx/5xx.

---

## Estructura del proyecto

```text
metaevaluacionesPRO1/
├── app/
│   ├── page.tsx
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── evaluate/route.ts
│       ├── meta-analyze/route.ts
│       └── infographic/route.ts
├── components/
│   ├── LoginGate.tsx
│   ├── AgentContextForm.tsx
│   ├── CsvUploader.tsx
│   ├── LLMConfigurator.tsx
│   ├── ProgressBar.tsx
│   ├── ResultsTable.tsx
│   ├── ScoreCharts.tsx
│   ├── AgentComparisonPanel.tsx
│   └── MetaEvaluationPanel.tsx
├── lib/
│   ├── types.ts
│   ├── openai.ts
│   ├── consistency.ts
│   ├── pdfGenerator.ts
│   ├── texGenerator.ts
│   ├── infographic.ts
│   └── infographicLocalRenderer.ts
├── docs/
│   └── report-standard.md
├── package.json
└── README.md
```

---

## Operación y troubleshooting

### Error 401 "No autorizado"

- Verifica que `ACCESS_KEY` en `.env.local` coincida con la que ingresas en UI.
- Si cambiaste la clave, cierra sesión y vuelve a ingresar.

### Error al cargar CSV

- Confirma nombres exactos de columnas:
  - `question`
  - `expectedResponse`
  - `actualResponse`
- Revisa delimitadores, comillas y filas vacías.

### Evaluación lenta o costosa

- Reduce tamaño del CSV.
- Usa menos evaluadores en paralelo.
- Ajusta `maxTokens` y modelo a una opción más liviana.

### Infografía no disponible

- El sistema intenta primero plantilla local (sin servicio externo).
- Si falla fallback NotebookLM:
  - habilitar variable `INFOGRAPHIC_ENABLE_NOTEBOOKLM_FALLBACK=1`
  - instalar/autenticar CLI NotebookLM
- Si falla fallback OpenAI, valida `OPENAI_API_KEY`.

---

## Limitaciones conocidas

- Autenticación simple por clave compartida (`x-access-key`), sin gestión de usuarios/roles.
- Persistencia de sesión en `sessionStorage` (no cookies HttpOnly/JWT).
- No hay persistencia de evaluaciones en base de datos; estado en memoria del cliente.
- En lotes grandes, el tiempo/costo de evaluación puede aumentar significativamente.
- El texto en UI menciona `META_EVALUATOR_MODEL`, pero actualmente el backend usa `OPENAI_MODEL`/config enviada.
- No hay límite explícito de tamaño para CSV en uploader (sí existe límite para `.txt` de instrucciones).

---

## Tecnologías

- Next.js 16 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- OpenAI SDK
- Papa Parse
- Recharts
- jsPDF + html2canvas
- JSZip

---

MetaEvaluaciones PRO — by [alemoralv](https://alemoralv.github.io/alemoralv/#home)
