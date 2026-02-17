# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RAG Multi-Domain: a platform for deploying domain-specific AI assistants powered by Retrieval-Augmented Generation. A single codebase serves multiple business verticals (restaurant, hair salon, etc.) differentiated only by YAML configuration, knowledge base, and business rules. All inference runs locally via Ollama — no cloud dependencies.

## Methodology

This project follows **Spec-Driven Development (SDD)**. Before implementing any task:
1. Read the relevant specification in `especificacion.md` (features, contracts, acceptance criteria)
2. Read the architecture in `arquitectura.md` (layers, patterns, data flows)
3. Follow TDD: write tests first, verify they fail, then implement

## Reference Documents (Read Before Implementing)

| Document | Purpose |
|----------|---------|
| `especificacion.md` | Formal SDD spec: 8 features with Given/When/Then criteria, data contracts, 13 tasks in 5 phases |
| `arquitectura.md` | Software architecture: layered (API→Domain→Infra), LangGraph pipeline, ADRs, deployment topology |
| `requirements.md` | 57 functional requirements (EARS format), 20 non-functional requirements, traceability matrix |
| `proyecto.md` | Narrative prose overview of the entire system |
| `ejecucion.md` | Step-by-step execution guide with prompts for each task |
| `alternativa.md` | Enhanced prompts combining tasks with skills from `habilidades.md` |

## Stack

- **Backend**: FastAPI >= 0.110, Python >= 3.11, Pydantic >= 2.6
- **RAG Orchestration**: LangChain >= 0.2, LangGraph >= 0.2
- **Vector Store**: ChromaDB >= 0.5 (embedded, one collection per domain: `kb_{domain_id}`)
- **Cache/Sessions**: Redis >= 7.0
- **Local LLM**: Ollama — `llama3.1:8b` (inference) + `nomic-embed-text` (embeddings)
- **Frontend**: React >= 18, TypeScript, Vite
- **PDF Parsing**: pypdf >= 4.0

## Target Directory Structure

```
rag-multidomain-mvp/
  backend/
    app/
      main.py              # FastAPI entry point
      settings.py           # Pydantic BaseSettings (env vars)
      api/                  # Endpoints: chat, chat_stream, ingest, domains
      core/                 # Business logic: domain_registry, chunking, schemas, policies, pdf_menu_parser
      infra/                # Adapters: chroma.py, redis.py, ollama.py
      rag/                  # Pipeline: graph.py (LangGraph), retrieval.py, prompts.py, formatters.py
      data/domains/         # YAML configs: restaurant.yaml, hair_salon.yaml
  frontend/
    src/
      api.ts               # SSE over POST client
      components/           # Chat.tsx, SourcesPanel.tsx, WarningsPanel.tsx
      pages/                # ChatPage.tsx, AdminIngest.tsx
```

## Architecture Invariants

1. **100% local execution** — no data leaves the environment. Ollama provides LLM + embeddings.
2. **Domain-agnostic core** — all domain variation lives in YAML config, never in code.
3. **Never invent** — respond only from retrieved context. Declare when evidence is insufficient.
4. **Always cite sources** — every response includes `{answer, warnings, sources}`.
5. **Proactive safety warnings** — health triggers (`alerg`, `celiac`, `intoler`, `embaraz`, `asma`, `dermat`, `urtic`, `anafil`, `hipert`, `diabet`) force domain-specific disclaimers.
6. **Semantic chunking** — fragment by conceptual structure (ingredients, allergens, contraindications), never by fixed size.
7. **Explicit domain** — `domain_id` always comes from frontend, never inferred.

## Key Patterns

- **LangGraph pipeline**: `Retrieve → Generate → Validate → Format → END` with typed `RAGState`
- **Registry pattern**: `domain_registry.py` loads YAML → `DOMAINS` dict, queried by all modules
- **Strategy pattern**: chunking function selected by `domain_id` (dish vs hair product)
- **Factory pattern**: infra clients via `get_chroma_client()`, `get_redis()`, `get_llm()`
- **SSE over POST**: streaming uses `fetch()` + `ReadableStream` (not native EventSource)

## SSE Event Order (Invariant)

```
meta → sources → warnings? → start → token* → done | error
```

Sources and warnings emit BEFORE tokens so frontend renders them immediately.

## Implementation Phases

Execute tasks sequentially by phase. Each task has acceptance criteria in `especificacion.md` section 4.

1. **Phase 1**: Scaffold, infra clients, domain registry
2. **Phase 2**: Pydantic schemas, semantic chunking, JSON ingest, PDF parser + ingest
3. **Phase 3**: Retrieval, prompts + policies, LangGraph graph, sync chat, streaming chat
4. **Phase 4**: SSE client (api.ts), Chat component with streaming, Admin panel
5. **Phase 5**: E2E integration test, second domain (hair_salon) without code changes

## Commands (Once Backend Exists)

```bash
# Prerequisites
docker run -d -p 6379:6379 redis:7
ollama serve
ollama pull llama3.1:8b
ollama pull nomic-embed-text

# Backend
cd backend && uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev

# Tests
cd backend && pytest
cd backend && pytest tests/test_schemas.py -v          # single test file
cd backend && pytest tests/test_policies.py::test_name  # single test

# Lint
cd backend && ruff check . && ruff format --check .
```

## Security Rules

- Use `yaml.safe_load()` — never `yaml.load()`
- Validate MIME type on PDF upload
- No `eval()`, `exec()`, `pickle.loads()` anywhere
- No `dangerouslySetInnerHTML` in React
- ChromaDB collections isolated per domain; Redis keys prefixed with `chat:{domain_id}:`
- The Validate node in the LangGraph pipeline is mandatory — never skip it
