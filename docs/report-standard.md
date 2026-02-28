# Estándar de Reportes de Evaluación de Agente

Este documento define el formato canónico para los reportes generados por la aplicación en sus dos salidas:

- PDF individual por evaluador
- PDF consolidado
- LaTeX (`.tex`)

## Colores oficiales

- `profublue`: `#004a99`
- `profugold`: `#ffc20e`

Estos colores deben usarse de forma consistente en:

- Portada
- Encabezados
- Títulos de secciones/subsecciones
- Tablas principales y reglas divisorias

## Datos obligatorios del contexto

Se capturan después del login y aplican a todas las exportaciones:

- Evaluador
- Agente
- Modelo
- Conocimiento
- Búsqueda Web (`si`/`no`)
- Conocimiento General (`si`/`no`)
- Orquestación (`si`/`no`)
- Herramientas (`si`/`no`)
- Fase de Prueba

Dato opcional:

- Instrucciones del sistema (`.txt` subido por usuario)

## Reglas de portada

- Título principal: `Evaluación del Agente:`
- Subtítulo principal: `<Nombre del agente>`
- Línea secundaria: `Fase de prueba: <fase>`
- Debajo de `Equipo de Inteligencia Artificial`: `Evaluador: <nombre>`
- Fecha: siempre la fecha actual al momento de generar el reporte

## Encabezado de páginas

Formato de texto:

`Evaluación del agente: <agente> | <evaluador>`

## Orden obligatorio de contenido

1. Portada
2. Tabla de contenido (en LaTeX)
3. Configuración del Agente
   - Introducción con modelo
   - Base de conocimiento
   - Parámetros adicionales (tabla sí/no)
   - Fase de prueba
   - Instrucciones del sistema (solo si existe)
4. Panorama General
5. Análisis Meta-evaluador (solo si aplica)
6. Secciones por evaluador con tablas, gráficas y conversación
7. Cierre del reporte

## Reglas para sección opcional de instrucciones

- Si no se sube `.txt`, la subsección no se renderiza.
- Si el contenido es muy grande, se permite truncado para mantener legibilidad.
- En LaTeX debe aplicarse escape de caracteres especiales antes de renderizar.

## Reglas de fallback

- Si falta un dato obligatorio en UI, no permitir avanzar.
- Si un valor booleano no está definido por error, usar `no`.
- Si no hay análisis meta, omitir la sección sin romper numeración/flujo del documento.
