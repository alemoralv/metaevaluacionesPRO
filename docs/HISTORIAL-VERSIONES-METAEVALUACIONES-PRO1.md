# Historial de versiones — MetaEvaluaciones PRO1

Este documento registra la evolución del proyecto **metaevaluacionesPRO1** (nombre npm: `metaevaluaciones-pro`): funcionalidades añadidas, mejoras por etapas y trabajo de **troubleshooting**. Las fechas provienen del historial de Git (autor: equipo del proyecto).

> **Nota:** El `package.json` declara la versión `1.0.0`; en la práctica el producto se ha ido enriqueciendo por hitos fechados. Aquí se usan **hitos cronológicos** alineados con los commits.

---

## Resumen en una tabla

| Fecha (aprox.) | Hito | Qué se sumó o cambió |
|----------------|------|----------------------|
| 2026-02-27 | **Origen** | App Next.js para evaluación con LLM, APIs, UI base, PDF/LaTeX, consistencia, login. |
| 2026-02-27 | **Operación en Vercel** | Evaluación por lotes en chunks de 10 filas para no superar el límite ~60 s. |
| 2026-02-28 | **Contexto y reportes** | Formulario de contexto del agente, estándar de reporte, mejoras PDF/TeX y tipos. |
| 2026-02-28 | **Login** | Ajustes en flujo de ingreso y `LoginGate`. |
| 2026-03-02 | **Comparación y exports** | Refactor de comparación de agentes, PDF/TeX ampliados, dependencias. |
| 2026-03-03 | **Meta-análisis** | Cambios en meta-análisis, `openai.ts`, PDF/TeX, panel meta, utilidades. |
| 2026-03-06 | **Infografía** | API de infografía, plantilla, renderer local, README. |
| 2026-03-10 | **Infografía y docs** | README extendido, renderer, assets, `tsconfig`, datos de panorama. |
| 2026-03-13 | **PDF diapositivas** | Exportación tipo slides del Panorama general. |
| 2026-03-19 | **README y UX** | README muy amplio, página principal, CSV, formularios, tipos, generadores. |
| 2026-04-08 | **Modo conversacional** | Evaluación conversacional, formato CSV asociado, `auth`, APIs y `openai.ts`. |
| 2026-04-08 | **Auth / login** | Pequeños ajustes en página, `LoginGate` y `auth` tras el modo conversacional. |
| 2026-04-14–15 | **OpenAI Gateway (sesión)** | Opción de login/sesión con URL base del gateway y claves `gw_`; evolución en varios commits. |
| 2026-04-15 | **Troubleshooting GW** | Corrección documentada: cabecera **`X-Gateway-API-Key`** en la creación del cliente OpenAI (ver sección final). |

---

## Hitos detallados

### 1. Lanzamiento inicial (27 feb 2026)

- Aplicación **MetaEvaluaciones PRO** (commit inicial describe Next.js 14; el stack ha seguido actualizándose).
- Flujo: login → contexto → CSV → configuración de evaluadores → evaluación → resultados.
- Rutas API: evaluación y meta-análisis.
- Componentes: carga CSV, configurador LLM, tablas y gráficas de resultados, comparación, meta-evaluación, barra de progreso.
- Librerías: integración OpenAI/Gemini (según diseño inicial), generación **PDF** y **LaTeX**, utilidades de **consistencia** entre evaluadores.
- Documentación inicial: `README`, `PRD`.

### 2. Mitigación de timeout en Vercel (27 feb 2026)

- **Problema:** las rutas serverless en Vercel tienen un límite de tiempo de ejecución (típicamente **60 s**).
- **Solución:** procesar la evaluación en **lotes de 10 filas** para mantener las peticiones dentro del presupuesto de tiempo.
- **Archivo principal afectado:** `app/page.tsx`.

### 3. Contexto del agente y enriquecimiento de reportes (28 feb 2026)

- Nuevo **`AgentContextForm`** y ampliación de **`app/page.tsx`**.
- Documento **`docs/report-standard.md`** alineado al estándar de reporte.
- **`lib/pdfGenerator.ts`** y **`lib/texGenerator.ts`**: más cobertura de contenido y formato.
- **`lib/types.ts`**: tipos adicionales para soportar el contexto en reportes.

### 4. Ajustes de acceso (28 feb 2026)

- Refinamiento de **`LoginGate`** y flujo en **`app/page.tsx`**.

### 5. Comparación de agentes y exports (2 mar 2026)

- **`AgentComparisonPanel`**: reorganización sustancial de la UI de comparación.
- **PDF / TeX:** extensiones grandes para reflejar mejor el panorama y los datos.
- **`package.json` / lockfile:** dependencias nuevas o actualizadas asociadas a esas capacidades.

### 6. Meta-análisis y pipeline OpenAI (3 mar 2026)

- **`app/api/meta-analyze/route.ts`** y **`MetaEvaluationPanel`**: ajustes funcionales.
- **`lib/openai.ts`:** cambios relevantes al comportamiento de llamadas al modelo en meta-análisis.
- Generadores **PDF/TeX** alineados con el nuevo contenido.
- Se añadió material de referencia en **`help_code.py`** (apoyo al desarrollo).

### 7. Infografía automatizada (6 mar 2026)

- Nueva ruta **`app/api/infographic/route.ts`**.
- Módulos **`lib/infographic.ts`** y **`lib/infographicLocalRenderer.ts`**.
- Integración en **`app/page.tsx`** y actualización del **README**.
- Recurso visual **`templateeval.png`**.
- Archivo de diagnóstico **`gcm-diagnose.log`** (contexto de depuración en ese momento).

### 8. Consolidación de infografía y documentación (10 mar 2026)

- **README** muy ampliado (guía funcional y técnica).
- Mejoras en **renderer** local de infografía y ajustes en **API** de infografía.
- **`LoginGate`**, **`panorama-general-datos.md`**, **`profuturologo.png`**.
- **`tsconfig.json`** y dependencias en **`package.json`** / lockfile.

### 9. Exportación PDF en formato diapositivas (13 mar 2026)

- Funcionalidad de **slides PDF** para el **Panorama general**.
- Implementación concentrada en **`lib/pdfGenerator.ts`** y enganche en **`app/page.tsx`**.

### 10. Gran actualización de README y flujo de producto (19 mar 2026)

- **README** como documento central de operación (CSV, métricas, exportaciones, arquitectura, troubleshooting del README, etc.).
- **`app/page.tsx`:** cambio grande en flujo y presentación.
- **`CsvUploader`**, **`AgentContextForm`**, **`LLMConfigurator`**, **`ResultsTable`**.
- **`lib/types.ts`** y ajustes en **PDF/TeX**.

### 11. Modo de evaluación conversacional y CSV (8 abr 2026)

- Evaluación por **turnos** de conversación además del modo por filas clásico.
- Contrato y validación de **CSV** actualizados en backend y UI.
- **`lib/auth.ts`** introducido o ampliado para necesidades de sesión/autenticación.
- **`lib/openai.ts`:** refactor sustancial para soportar prompts y flujo conversacional.
- APIs **`evaluate`**, **`meta-analyze`**, **`infographic`** tocadas para coherencia con el nuevo modo.
- **`LoginGate`** y **`LLMConfigurator`** ampliados.

### 12. Ajustes posteriores al modo conversacional (8 abr 2026)

- Cambios puntuales en **`app/page.tsx`**, **`LoginGate`** y **`lib/auth.ts`** (mensaje de commit genérico: “your commit message”).

### 13. OpenAI Gateway en sesión de usuario (14–15 abr 2026)

- Opción para usar **URL base del gateway** (`openAiBaseUrl`) y claves con prefijo **`gw_`** en el flujo de login/sesión.
- Propagación de configuración a rutas de evaluación y meta-análisis, tipos y cliente OpenAI.
- Varios commits con el mismo mensaje de feature indican **iteración** (ajustes finos, despliegue o pruebas) hasta la fecha más reciente en Git.

---

## Troubleshooting (registro consolidado)

### A. Timeouts en Vercel durante la evaluación

- **Síntoma:** errores o cortes al evaluar muchas filas en una sola petición.
- **Causa:** límite de duración de funciones serverless (~**60 s**).
- **Enfoque adoptado:** dividir el trabajo en **chunks de 10 filas** desde el cliente (orquestación en `app/page.tsx`), de modo que cada llamada a la API sea más corta.

### B. Infografía y render local

- Hubo ciclos de trabajo con **API de infografía**, **renderer local** y archivos de **diagnóstico** (`gcm-diagnose.log` en el repo en una fase), reflejando prueba-error hasta estabilizar la generación y el branding (logo, plantilla).

### C. Conexión al **OpenAI Gateway** (último arreglo destacado)

- **Contexto:** en modo gateway, cuando hay **`openAiBaseUrl`** configurada y la clave **empieza con `gw_`**, el cliente debe hablar con el endpoint del gateway, no solo con la API estándar de OpenAI.
- **Problema observado:** en una versión intermedia del código solo se enviaban cabeceras del estilo **`x-api-key`** y **`api-key`** (además de `baseURL` y la `apiKey` del SDK). Eso resultaba **insuficiente** para que el gateway autenticara correctamente la petición.
- **Orientación recibida (ChatGPT):** el SDK de OpenAI permite `baseURL` y **cabeceras por defecto** al crear el cliente; ahí es donde debe incluirse explícitamente **`X-Gateway-API-Key`** además de las otras cabeceras, cuando se entra en modo gateway.
- **Resultado esperado:** en **`createOpenAiClient(...)`**, en modo gateway (`openAiBaseUrl` presente + clave `gw_`), las peticiones deben incluir **`X-Gateway-API-Key`** junto con el resto de headers requeridos por el gateway, de forma que el cliente quede alineado con el contrato del GW.

*(Este apartado documenta el arreglo; no sustituye la revisión del código vigente en el repositorio.)*

---

## Cómo usar este documento

- Para **auditoría** o handover: seguir la tabla y ampliar con notas de release cuando haya commits nuevos.
- Para **nuevas incidencias:** añadir filas en la tabla y una subsección breve en **Troubleshooting** con síntoma, causa y solución verificada.

---

*Documento generado para registrar la evolución del proyecto hasta abril de 2026. Actualizar con cada hito relevante.*
