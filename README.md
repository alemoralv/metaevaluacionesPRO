# MetaEvaluaciones PRO

Herramienta web para evaluar automáticamente la calidad de respuestas de agentes de IA usando OpenAI. Permite subir un CSV con preguntas y respuestas, configurar uno o varios modelos como evaluadores, y obtener calificaciones en múltiples dimensiones con exportación a PDF, LaTeX e infografía.

---

## Tabla de contenidos

- [Inicio rápido](#inicio-rápido)
- [Flujo de uso](#flujo-de-uso)
- [Formato del CSV](#formato-del-csv)
- [Dimensiones de evaluación](#dimensiones-de-evaluación)
- [Exportaciones](#exportaciones)
- [Infografía](#infografía)
- [Variables de entorno](#variables-de-entorno)
- [Deploy en Vercel](#deploy-en-vercel)
- [Estructura del proyecto](#estructura-del-proyecto)

---

## Inicio rápido

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Crea un archivo `.env.local` en la raíz del proyecto con:

```
OPENAI_API_KEY=sk-tu-api-key-de-openai
ACCESS_KEY=tu-clave-de-acceso
OPENAI_MODEL=gpt-4o-mini
```

### 3. Ejecutar en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

---

## Flujo de uso

1. **Login** — Introduce la clave de acceso (`ACCESS_KEY`).
2. **Contexto del reporte** — Completa los datos del agente: evaluador, agente, modelo, base de conocimiento, capacidades (búsqueda web, conocimiento general, orquestación, herramientas), fase de prueba. Opcionalmente sube instrucciones del sistema en `.txt`.
3. **Subir CSV** — Arrastra o selecciona un archivo con las columnas `question`, `expectedResponse`, `actualResponse`.
4. **Configurar evaluadores** — Añade uno o más modelos LLM como evaluadores (modelo, temperatura, etc.). Opcionalmente activa el **análisis meta-evaluador** para comparar la consistencia entre evaluadores.
5. **Evaluar** — La app procesa las filas en streaming y muestra el progreso en tiempo real.
6. **Resultados** — Explora el panorama general, las tablas por evaluador, el análisis meta (si aplica) y descarga CSV, PDF, LaTeX o infografía.

---

## Formato del CSV

El archivo CSV debe contener estas columnas (los nombres deben ser exactos):

| Columna           | Descripción                          |
|-------------------|--------------------------------------|
| `question`        | La pregunta del usuario              |
| `expectedResponse`| La respuesta correcta esperada       |
| `actualResponse`  | La respuesta que dio el agente de IA |

---

## Dimensiones de evaluación

Cada respuesta se evalúa en 7 dimensiones (puntaje 0–100):

| Dimensión     | Descripción                                                                 |
|---------------|-------------------------------------------------------------------------------|
| **Precisión** | ¿Es factualmente correcta comparada con la respuesta esperada?               |
| **Completitud** | ¿Cubre todos los puntos clave?                                             |
| **Relevancia** | ¿Se mantiene en tema sin información inventada?                             |
| **Coherencia** | ¿La respuesta es lógica y bien estructurada?                                |
| **Claridad**  | ¿Es fácil de entender?                                                       |
| **Utilidad**  | ¿Resuelve el problema del usuario?                                           |
| **General**   | Promedio ponderado de las anteriores                                        |

Los resultados se pueden descargar como CSV con las columnas originales más las calificaciones.

---

## Exportaciones

| Formato              | Descripción                                                                 |
|----------------------|-----------------------------------------------------------------------------|
| **CSV**              | Tabla enriquecida con todas las dimensiones y feedback (desde la tabla de resultados). |
| **PDF individual**   | Reporte de un solo evaluador (gráficas + tabla).                           |
| **PDF consolidado**  | Reporte completo: portada, configuración, panorama general, meta-evaluación (si aplica) y secciones por evaluador. |
| **LaTeX**            | Archivo `.tex` listo para compilar con pdflatex.                            |
| **Infografía**       | Imagen PNG estandarizada con resumen visual (ver sección [Infografía](#infografía)). |

---

## Infografía

La infografía resume el panorama de evaluación en una imagen estándar. Flujo de generación:

1. **NotebookLM** — Si está configurado y autenticado, se usa `notebooklm generate infographic`.
2. **Fallback local** — Si NotebookLM no está disponible, se genera un SVG corporativo estándar.
3. **OpenAI** — Si el fallback local falla y `OPENAI_API_KEY` está configurada, se intenta generar con el modelo configurado.

### Requisitos para NotebookLM (opcional)

```bash
pip install "notebooklm-py[browser]"
playwright install chromium
notebooklm login
notebooklm list --json
```

Si no usas NotebookLM, el sistema sigue funcionando con el fallback local.

---

## Variables de entorno

| Variable         | Descripción                                      | Requerida |
|------------------|--------------------------------------------------|-----------|
| `OPENAI_API_KEY` | API key de OpenAI para evaluación e infografía   | Sí        |
| `ACCESS_KEY`     | Clave de acceso para entrar a la aplicación      | Sí        |
| `OPENAI_MODEL`   | Modelo por defecto (ej. `gpt-4o-mini`)           | No        |

---

## Deploy en Vercel

1. Sube el repositorio a GitHub.
2. Importa el proyecto en [vercel.com](https://vercel.com).
3. Configura las variables de entorno en el dashboard:
   - `OPENAI_API_KEY`
   - `ACCESS_KEY`
   - `OPENAI_MODEL` (opcional)
4. Deploy.

---

## Estructura del proyecto

```
metaevaluacionesPRO1/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── api/
│       ├── evaluate/route.ts      # Evaluación por filas
│       ├── meta-analyze/route.ts  # Análisis meta-evaluador
│       └── infographic/route.ts   # Generación de infografía
├── components/
│   ├── LoginGate.tsx
│   ├── AgentContextForm.tsx
│   ├── CsvUploader.tsx
│   ├── LLMConfigurator.tsx
│   ├── ProgressBar.tsx
│   ├── ResultsTable.tsx
│   ├── ScoreCharts.tsx
│   ├── MetaEvaluationPanel.tsx
│   └── AgentComparisonPanel.tsx
├── lib/
│   ├── openai.ts
│   ├── types.ts
│   ├── consistency.ts
│   ├── pdfGenerator.ts
│   ├── texGenerator.ts
│   ├── infographic.ts
│   └── infographicLocalRenderer.ts
├── docs/
│   └── report-standard.md
├── package.json
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

---

## Tecnologías

- **Next.js 16** — Framework full-stack (App Router)
- **React 18** — UI
- **Tailwind CSS** — Estilos
- **OpenAI SDK** — Evaluación con LLMs
- **Papa Parse** — Parsing de CSV
- **Recharts** — Gráficas
- **jsPDF / html2canvas** — Generación de PDF
- **TypeScript** — Tipado estático

---

*MetaEvaluaciones PRO* — by [alemoralv](https://alemoralv.github.io/alemoralv/#home)
