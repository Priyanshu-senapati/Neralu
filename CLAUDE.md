# Neralu
Heatwave welfare-check system: calls elderly people who live alone, checks observable warning signs,
escalates to humans. Full spec and build order: docs/NERALU_PLAN.md — read it before any task.

Rules for working in this repo:
- Follow the build order in docs/NERALU_PLAN.md §9. One task at a time. Tests pass before moving on. Commit per task.
- The safety decision is made by deterministic rules in backend/app/rules.py. Never let an LLM decide an outcome.
- The system never calls 108/emergency services. Only a human records "called 108".
- No placeholder UI. If a button exists, it works. If it doesn't work yet, it doesn't exist.
- No emoji, no gradients, no glassmorphism, no "AI-powered" marketing copy. Follow §8 design rules.
- Everything simulated (weather, demo clock, the ~400 seeded residents' responses, family notifications) is labelled as simulated in data and UI.
- Keep files small and single-purpose. Backend: FastAPI + SQLModel + SQLite. Frontend: Vite + React + TypeScript + Tailwind.

Local dev (Windows):
- Backend: `cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload` · tests: `pytest`
- Frontend: `cd frontend && npm run dev`
