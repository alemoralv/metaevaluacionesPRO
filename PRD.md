# Product Requirements Document: MetaEvaluaciones PRO

## 1. Executive Summary

MetaEvaluaciones PRO is a minimalist web application that allows QA reviewers to upload CSV files containing AI agent interactions (question, expected response, actual response) and automatically evaluate the quality of the actual responses using OpenAI. The app grades each response on multiple dimensions -- accuracy, completeness, and relevance -- producing a score (1-10) for each, plus qualitative feedback. Results are displayed in-app and downloadable as an enriched CSV.

**MVP Goal:** A single-page app behind a password gate that processes CSVs and returns multi-dimensional evaluations via OpenAI.

## 2. Mission

**Mission Statement:** Automatizar la evaluación de calidad de respuestas de agentes de IA para equipos de QA.

**Core Principles:**
1. Simplicidad ante todo -- la herramienta debe ser intuitiva para usuarios no técnicos
2. Evaluación consistente y objetiva usando LLMs
3. Resultados accionables y exportables

## 3. Target Users

### Primary Persona
- **Who:** QA/evaluation team members at Profuturo who review AI agent (Help Desk) responses
- **Technical Level:** Non-technical -- need a simple drag-and-drop interface, no CLI or config
- **Key Needs:** Quickly evaluate batches of AI responses without manually reviewing each one

## 4. MVP Scope

### In Scope

**Core Functionality:**
- [x] Password-protected access (single shared key)
- [x] CSV upload with drag-and-drop
- [x] Parsing of `question`, `expectedResponse`, `actualResponse` columns
- [x] OpenAI-powered evaluation on 3 dimensions: accuracy (1-10), completeness (1-10), relevance (1-10)
- [x] Overall score (average of 3 dimensions)
- [x] Qualitative feedback per row
- [x] Results table displayed in browser with color-coded scores
- [x] CSV download with original columns + evaluation columns
- [x] Progress indicator during evaluation

**Technical:**
- [x] Environment variables for all secrets
- [x] Vercel deployment ready
- [x] Streaming API for real-time progress

### Out of Scope
- User accounts / multi-user auth
- Evaluation history / database storage
- Custom evaluation criteria
- Batch comparison across multiple CSVs

## 5. User Stories

1. As a reviewer, I want to enter an access key so that only authorized people can use the tool
2. As a reviewer, I want to upload a CSV file so that I can evaluate AI responses in batch
3. As a reviewer, I want to see a progress bar while evaluation runs so I know it is working
4. As a reviewer, I want to see evaluation results in a table so I can quickly scan quality
5. As a reviewer, I want to download results as CSV so I can share them and analyze in Excel

## 6. Core Architecture

```
metaevaluacionesPRO1/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── api/evaluate/route.ts
├── components/
│   ├── LoginGate.tsx
│   ├── CsvUploader.tsx
│   ├── ResultsTable.tsx
│   └── ProgressBar.tsx
├── lib/
│   ├── openai.ts
│   └── types.ts
├── .env.local
├── .gitignore
├── package.json
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

## 7. Technology Stack

| Technology | Purpose | Version |
|------------|---------|---------|
| Next.js | Full-stack framework (App Router) | 14.x |
| React | UI components | 18.x |
| Tailwind CSS | Styling | 3.x |
| OpenAI SDK | AI evaluation calls | latest |
| Papa Parse | CSV parsing | 5.x |
| TypeScript | Type safety | 5.x |
| Vercel | Deployment | - |

## 8. Security & Configuration

### Authentication
Simple shared access key compared against `ACCESS_KEY` env var. Sent as `x-access-key` header on every API request for server-side validation.

### Environment Variables
| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | OpenAI API key for evaluation calls |
| `ACCESS_KEY` | Shared password to access the app |
| `OPENAI_MODEL` | Model to use (default: gpt-4o-mini) |

## 9. API Specification

### Evaluate
- **Method:** POST
- **Path:** /api/evaluate
- **Auth:** `x-access-key` header
- **Request:** `{ "rows": [{ "question": "...", "expectedResponse": "...", "actualResponse": "..." }] }`
- **Response:** NDJSON stream of `{ "index", "accuracy", "completeness", "relevance", "overallScore", "feedback" }`

## 10. Success Criteria

- User can upload a CSV, see results, and download enriched CSV in under 3 minutes for 50 rows
- Evaluation scores are consistent and meaningful
- App loads in under 2 seconds
- Works on Chrome, Edge, Firefox

## 11. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| OpenAI API rate limits for large CSVs | M | Process rows sequentially with streaming |
| Vercel function timeout (60s on Hobby) | M | Streaming keeps connection alive; large CSVs may need Pro plan |
| Inconsistent LLM scoring | L | Low temperature (0.2), structured JSON output, detailed prompt |
| CSV encoding issues | L | UTF-8 BOM in exports, Papa Parse handles most encodings |
