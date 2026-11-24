# Chronicle

*A personal space to keep track of time, tasks, and life.*

Chronicle started as a simple idea: build something of my own that could help me keep track of how I spend my time, manage everyday tasks and bring a little more structure to life. What began as a small task-management prototype gradually grew into an attempt to build a more complete personal assistant.

This branch represents that ongoing development. The goal is to move beyond simply keeping track of tasks, towards a space where planning, time tracking, reflection and understanding daily habits come together.

## Preview

![Chronicle Preview](./screenshots/chronicle.png)

## What's Working

- **Tasks** — Create, edit, organise, complete and manage tasks.
- **Schedule** — Plan and manage activities throughout the day.
- **Time Tracking** — Track time spent on activities.
- **Journal** — Record daily thoughts and experiences.
- **Insights** — View summaries of tracked activities and time.
- **Reminders** — Set reminders for planned activities.
- **Themes** — Switch between light and dark modes.

## Tech Stack

- React
- TypeScript
- Vite
- Python
- FastAPI
- SQLite

## Running Locally

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
python -m venv venv
```

Activate the virtual environment:

**Windows**
```bash
venv\Scripts\activate
```

**macOS / Linux**
```bash
source venv/bin/activate
```

Install dependencies and start the server:

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

## What's next

Chronicle is still a work in progress. Some ideas for its future include more flexible activity tracking, better reminders, calendar integration, richer insights into time and habits, and eventually a more accessible experience across devices.

For now, it's an ongoing attempt to turn an idea into something genuinely useful, while learning along the way.

---

*Built one step at a time.*