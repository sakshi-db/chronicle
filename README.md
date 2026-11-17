
# Chronicle

**A personal assistant for organising everyday life.**

Chronicle is an early working prototype of a personal AI assistant, built around a bigger vision: an intelligent companion that helps people organise their time, manage commitments and navigate everyday life.

This is the first step towards that vision. The current version focuses on foundational task management, with more capabilities to come.

## Current features

- Create, view, edit and delete tasks
- Mark tasks as completed
- Store tasks in a local SQLite database

## Built with

- React, TypeScript and Vite
- Python and FastAPI
- SQLite

## Run locally

### Backend

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment and install dependencies:

**Windows PowerShell**
```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

### Frontend

Open a second terminal from the project root:

```bash
npm install
npm run dev
```

Open the local URL provided by Vite.

---

*An ongoing experiment in building something useful, one step at a time.*
