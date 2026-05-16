# AI-Powered Brainstorming Board

A professional, high-usability **Traditional Kanban Board** for brainstorming, powered by FastAPI and React. Features AI-driven insights, cluster summarization, and seamless drag-and-drop.

## Key Features
- **Traditional Kanban UI**: A clean, high-contrast design (Teal/Emerald theme) optimized for focus and usability.
- **AI Insights**: Powered by **Gemini 3.1 Flash Lite** to summarize clusters and provide next-step suggestions.
- **Robust Auth**: JWT-based authentication for secure board management.
- **Snappy Drag & Drop**: Smooth board interactions with `@hello-pangea/dnd`.
- **Lightweight DB**: Uses SQLite for zero-configuration local development.

## Tech Stack
- **Frontend**: React (Vite, TS), TailwindCSS, TanStack Query, Lucide Icons.
- **Backend**: FastAPI (Python 3.10+), SQLAlchemy (SQLite), Pydantic v2.
- **AI**: Google Generative AI (Gemini SDK).

## Setup & Local Development

### 1. Backend Setup
1. Navigate to `backend/`.
2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure environment:
   - Copy `.env.example` to `.env`.
   - Add your `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/app/apikey).
5. Start the server:
   ```bash
   uvicorn app.main:app --port 8000
   ```

### 2. Frontend Setup
1. Navigate to `frontend/`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:5174](http://localhost:5174) in your browser.

## Environment Variables

### Backend (.env)
- `GEMINI_API_KEY`: Your Google Gemini API Key.
- `TEXT_MODEL`: Defaulted to `gemini-3.1-flash-lite`.
- `JWT_SECRET`: A secret string for signing auth tokens.

## License
MIT
