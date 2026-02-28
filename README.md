# MetaEvaluaciones PRO

Evaluación automática de respuestas de agentes de IA usando OpenAI.

## Inicio rápido

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Copia `.env.local` y configura tus valores:

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

## Formato del CSV

El archivo CSV debe contener estas columnas (los nombres deben ser exactos):

| Columna | Descripción |
|---------|-------------|
| `question` | La pregunta del usuario |
| `expectedResponse` | La respuesta correcta esperada |
| `actualResponse` | La respuesta que dio el agente de IA |

## Deploy en Vercel

1. Sube el repositorio a GitHub
2. Importa el proyecto en [vercel.com](https://vercel.com)
3. Configura las variables de entorno en el dashboard de Vercel:
   - `OPENAI_API_KEY`
   - `ACCESS_KEY`
   - `OPENAI_MODEL`
4. Deploy

## Evaluación

Cada respuesta se evalúa en 3 dimensiones (puntaje 1-10):

- **Precisión:** ¿Es factualmente correcta comparada con la respuesta esperada?
- **Completitud:** ¿Cubre todos los puntos clave?
- **Relevancia:** ¿Se mantiene en tema sin información inventada?

Los resultados se pueden descargar como CSV con las columnas originales más las calificaciones.
