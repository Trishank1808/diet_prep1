# DietPrep 🥗

A personalised health & fitness tracker built for Indian college life — now with a **real Python backend + database**.

## Folder structure
```
dietprep/
├── index.html              ← frontend page
├── style.css                ← all styling
├── app.js                    ← frontend logic (calls the backend API)
└── backend/
    ├── main.py                ← FastAPI server + all API routes
    ├── requirements.txt       ← Python dependencies
    └── dietprep.db             ← SQLite database (auto-created on first run)
```

## How it works
- **Frontend**: plain HTML/CSS/JS, no build step needed.
- **Backend**: Python (FastAPI) + SQLite. Stores profile, food log, workout log,
  weight log, and the food database permanently on disk in `dietprep.db`.
- The frontend talks to the backend over `http://127.0.0.1:8000/api/...` using `fetch`.

## Step 1 — Run the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
```

Leave this terminal running. You can browse the auto-generated API docs at
**http://127.0.0.1:8000/docs**

## Step 2 — Open the frontend

Open `index.html` with **VS Code Live Server** (recommended), or just double-click
the file to open it in your browser.

> The frontend is hardcoded to call the backend at `http://127.0.0.1:8000/api`.
> If you run the backend on a different host/port, update `API_BASE` at the top
> of `app.js`.

## API endpoints

| Method | Path                    | Description                       |
|--------|-------------------------|------------------------------------|
| GET    | `/api/profile`           | Get saved profile                  |
| POST   | `/api/profile`           | Create/update profile              |
| GET    | `/api/food-log`          | Get all food log entries           |
| POST   | `/api/food-log`          | Add a food log entry               |
| DELETE | `/api/food-log/{id}`     | Delete a food log entry            |
| GET    | `/api/workout-log`       | Get all workout entries            |
| POST   | `/api/workout-log`       | Add a workout entry                |
| DELETE | `/api/workout-log/{id}`  | Delete a workout entry             |
| GET    | `/api/weight-log`        | Get weight history                 |
| POST   | `/api/weight-log`        | Log today's weight                 |
| GET    | `/api/food-db`           | Get the food database (with search)|
| POST   | `/api/food-db`           | Add a food item                    |
| DELETE | `/api/food-db/{name}`    | Delete a food item                 |
| GET    | `/api/streak`            | Get logged dates for streak calc   |

## Notes
- This is single-user (no login) — all data is stored in one shared `dietprep.db` file.
- The "AI Weekly Report" feature still calls the Anthropic API directly from the
  browser for the report text; this is unrelated to the new Python backend.
live link:
## 🚀 Live Demo
Try it here: [DietPrep Live Demo](https://your-deployed-url.herokuapp.com)
