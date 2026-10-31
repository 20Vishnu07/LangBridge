![React](https://img.shields.io/badge/Frontend-React-61DAFB?logo=react&logoColor=20232A) ![Node.js](https://img.shields.io/badge/Backend-Node.js-339933?logo=node.js&logoColor=white)

# LangBridge

LangBridge is an AI-powered vernacular pedagogy and real-time translation platform for mother-tongue-based primary education. It helps teachers transform Hindi learning content into Santali resources written in Ol Chiki and generate classroom-ready bilingual worksheets.

## Capabilities

- Hindi-to-Santali translation workflow
- Text and speech-service integration through the backend proxy
- AI-generated bilingual worksheets for classroom practice
- Unresolved-term logging with confidence scores
- Redis caching for repeated translation requests
- PostgreSQL persistence for teacher and translation-review data

## Architecture

```text
frontend/   React client application
backend/    Node.js/Express API with PostgreSQL and Redis integrations
```

The backend exposes `/api/translate` and `/api/worksheet` routes, plus a `/health` endpoint. Worksheet generation requires a Groq API key; translation features may require the configured speech service.

## Run locally

### Backend

```bash
cd backend
npm install
npm start
```

Provide the required environment variables for PostgreSQL, Redis, the speech service, and Groq before using connected features.

### Frontend

```bash
cd frontend
npm install
npm start
```

The frontend is based on Create React App and runs on its development server by default.

## Configuration and safety

Use environment files for local configuration and keep credentials out of Git. The repository includes backend and frontend environment examples where available. Do not commit populated secrets or production connection strings.