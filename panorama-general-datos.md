# Datos del Panorama General - MetaEvaluaciones PRO

## Contexto de la evaluación
- **Sistema**: MetaEvaluaciones PRO
- **Fecha**: 6 de marzo de 2026
- **Evaluador**: alemoralv

## KPI principales
- **Preguntas evaluadas**: 82
- **Número de evaluadores**: 6
- **Promedio global**: 62.5
- **Mejor evaluador**: gpt-4o-mini (T=1) con 63
- **Evaluador más bajo**: gpt-4o-mini (T=0.4) con 62.1

## Métricas por dimensión
| Dimensión | Promedio |
|-----------|----------|
| Precisión | 58.8 |
| Completitud | 49.6 |
| Relevancia | 57.6 |
| Coherencia | 78.4 |
| Claridad | 75.6 |
| Utilidad | 56.5 |
| General | 62.8 |

## Evaluadores LLM configurados
1. gpt-4o-mini (T=0)
2. gpt-4o-mini (T=0.2)
3. gpt-4o-mini (T=0.4)
4. gpt-4o-mini (T=0.6)
5. gpt-4o-mini (T=0.8)
6. gpt-4o-mini (T=1)

## Análisis del meta-evaluador

### Resumen ejecutivo
El rendimiento de los evaluadores muestra un desempeño moderado en la evaluación de las respuestas del agente de IA. Con un promedio general de 62.5, se observa que las dimensiones de Coherencia y Claridad son las más fuertes.

### Análisis por dimensión
- **Precisión**: Promedio 58.6, consistencia entre evaluadores buena (σ=3.2)
- **Completitud**: Dimensión más débil con promedio 49.3
- **Relevancia**: Promedio 57.3
- **Coherencia**: Dimensión más fuerte con promedio 77.4
- **Claridad**: Fuerte con promedio 75.7 (σ=4.1)
- **Utilidad**: Promedio 56.6

### Comparación de evaluadores
- **Más generoso**: gpt-4o-mini (T=1) - 57.3% aprobación, promedio 63
- **Más estricto**: gpt-4o-mini (T=0.8) - 51.2% aprobación
- **Más consistente**: gpt-4o-mini (T=0.2)

### Recomendaciones
1. Ajustar la configuración del agente para priorizar la inclusión de información completa en las respuestas (Completitud)
2. Implementar un sistema de retroalimentación continua para reducir la variabilidad en Claridad

## Área más fuerte
**Coherencia** (78.4%) es el área más fuerte del agente evaluado.
