# AI-Powered Brainstorming Board (FastAPI + React)
##https://brainstorming-board-nb-1.onrender.com/login
#A Trello-like brainstorming board with AI-powered suggestions, clustering, and summarization.

## Stack
- Frontend: React (Vite + TypeScript) + TailwindCSS + @hello-pangea/dnd + TanStack Query
- Backend: FastAPI (Python) + Uvicorn
- Database: MongoDB Atlas (motor)
- Auth: Email/Password with JWT (PyJWT + passlib)
- AI: Google Gemini API (text + embeddings)
- Deploy: Vercel (frontend) + Render (backend)

## Monorepo Structure
```
brainstorming_board_nb/
  frontend/
  backend/
  README.md
```

## Requirements
- Node.js 18+
- Python 3.11+
- (Optional) MongoDB Atlas URI
- (Optional) Gemini API Key

## Setup

### 1) Frontend
```
cd frontend
npm install
cp .env.example .env
npm run dev
```

### 2) Backend
```
cd backend
python -m venv .venv
. .venv/Scripts/activate  # Windows PowerShell: .venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

- Backend base URL: http://localhost:8000
- Frontend base URL: http://localhost:5173 (Vite default)

## Environment Variables

### frontend/.env.example
```
VITE_API_BASE_URL=http://localhost:8000
```

### backend/.env.example
```
# Server
PORT=8000
CORS_ORIGINS=http://localhost:5173

# Mongo
MONGODB_URI=
MONGODB_DB=brainstorm_board

# Auth
JWT_SECRET=replace_with_strong_secret
JWT_ALG=HS256
JWT_EXPIRE_MINUTES=43200  # 30 days

# AI
GEMINI_API_KEY=
EMBEDDINGS_MODEL=text-embedding-004
TEXT_MODEL=gemini-1.5-flash
```

## Scripts
- frontend: `npm run dev`, `npm run build`, `npm run preview`
- backend: `uvicorn app.main:app --reload --port 8000`

## Deploy

### Frontend (Vercel)
- Framework: Vite
- Build Command: `npm run build`
- Output: `dist`
- Env: `VITE_API_BASE_URL` → Render backend URL

### Backend (Render)
- New Web Service
- Runtime: Python 3.11
- Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Env: see `backend/.env.example`

## Roadmap
- Auth flows (signup/login) with JWT
- CRUD for boards/columns/cards with DnD persistence
- AI suggestions on card create
- Embeddings + clustering + color-coded labels
- Board summarization + sidebar

## License
MIT
