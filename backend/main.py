"""
DietPrep Backend API
A FastAPI + SQLite backend for the DietPrep health tracker.
Run with: uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "dietprep.db")

app = FastAPI(title="DietPrep API", version="1.0.0")

# Allow the frontend (served from anywhere, e.g. Live Server on 5500) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ───────────────────────── DATABASE SETUP ─────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS profile (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            name TEXT NOT NULL,
            age INTEGER NOT NULL,
            weight REAL NOT NULL,
            height REAL NOT NULL,
            activity REAL NOT NULL,
            goal TEXT NOT NULL DEFAULT 'loss'
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS food_log (
            id TEXT PRIMARY KEY,
            meal TEXT NOT NULL,
            name TEXT NOT NULL,
            qty REAL NOT NULL,
            cal REAL NOT NULL,
            protein REAL NOT NULL DEFAULT 0,
            carbs REAL NOT NULL DEFAULT 0,
            fat REAL NOT NULL DEFAULT 0,
            date TEXT NOT NULL
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS workout_log (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            sets INTEGER NOT NULL,
            reps TEXT NOT NULL,
            weight TEXT,
            burned REAL NOT NULL,
            date TEXT NOT NULL
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS weight_log (
            date TEXT PRIMARY KEY,
            val REAL NOT NULL
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS food_db (
            name TEXT PRIMARY KEY,
            cal REAL NOT NULL,
            protein REAL NOT NULL,
            carbs REAL NOT NULL,
            fat REAL NOT NULL,
            type TEXT NOT NULL
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS streak (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            logged_dates TEXT NOT NULL DEFAULT ''
        )
    """)

    # Seed the food database with common Indian foods, only if empty
    c.execute("SELECT COUNT(*) FROM food_db")
    if c.fetchone()[0] == 0:
        seed_foods = [
            ('Dal (Toor/Arhar)', 116, 7.6, 19, 0.4, 'veg'),
            ('Roti (Chapati)', 297, 8.1, 54, 3.7, 'veg'),
            ('Paratha (plain)', 300, 6.5, 48, 9, 'veg'),
            ('White Rice (cooked)', 130, 2.7, 28, 0.3, 'veg'),
            ('Brown Rice (cooked)', 123, 2.6, 26, 1, 'veg'),
            ('Idli (1 piece ~30g)', 39, 2.1, 7.9, 0.2, 'veg'),
            ('Dosa (plain)', 168, 3.4, 31, 3.2, 'veg'),
            ('Sambar', 52, 2.9, 8, 0.5, 'veg'),
            ('Paneer', 265, 18, 1.2, 20, 'veg'),
            ('Palak Paneer', 154, 9, 5, 11, 'veg'),
            ('Chicken Curry', 175, 20, 4, 9, 'non'),
            ('Egg (boiled)', 155, 13, 1.1, 11, 'non'),
            ('Rajma (Kidney beans)', 127, 8.7, 22, 0.5, 'veg'),
            ('Chole (Chickpea)', 164, 9, 27, 2.6, 'veg'),
            ('Biryani (chicken)', 202, 12, 25, 5, 'non'),
            ('Poha', 201, 3.6, 43, 2.2, 'veg'),
            ('Upma', 150, 3.5, 28, 3, 'veg'),
            ('Dahi (Curd)', 60, 3.4, 4.7, 3.3, 'veg'),
            ('Lassi (sweet)', 134, 4.2, 22, 3.5, 'veg'),
            ('Chaas (Buttermilk)', 40, 2.5, 4, 1.5, 'veg'),
            ('Chai with milk', 55, 2, 7, 2, 'veg'),
            ('Banana', 89, 1.1, 23, 0.3, 'veg'),
            ('Apple', 52, 0.3, 14, 0.2, 'veg'),
            ('Orange', 47, 0.9, 12, 0.1, 'veg'),
            ('Samosa (1 piece ~60g)', 262, 4, 29, 14, 'veg'),
            ('Pav Bhaji', 230, 5, 35, 8, 'veg'),
            ('Bread slice (white)', 79, 2.7, 15, 1, 'veg'),
            ('Peanut butter (1 tbsp)', 94, 4, 3, 8, 'veg'),
            ('Whey protein (1 scoop)', 120, 25, 3, 1.5, 'non'),
            ('Moong Dal', 147, 9.9, 24, 0.8, 'veg'),
            ('Bhindi (Okra)', 33, 1.9, 7, 0.2, 'veg'),
            ('Aloo Gobi', 95, 2.5, 14, 4, 'veg'),
            ('Fish curry', 148, 18, 3, 7, 'non'),
            ('Mutton curry', 243, 22, 2, 16, 'non'),
        ]
        c.executemany(
            "INSERT INTO food_db (name, cal, protein, carbs, fat, type) VALUES (?, ?, ?, ?, ?, ?)",
            seed_foods,
        )

    c.execute("SELECT COUNT(*) FROM streak")
    if c.fetchone()[0] == 0:
        c.execute("INSERT INTO streak (id, logged_dates) VALUES (1, '')")

    conn.commit()
    conn.close()


init_db()


# ───────────────────────── MODELS ─────────────────────────
class Profile(BaseModel):
    name: str
    age: int
    weight: float
    height: float
    activity: float
    goal: str = "loss"


class FoodLogEntry(BaseModel):
    id: str
    meal: str
    name: str
    qty: float
    cal: float
    protein: float = 0
    carbs: float = 0
    fat: float = 0
    date: str


class WorkoutLogEntry(BaseModel):
    id: str
    name: str
    sets: int
    reps: str
    weight: Optional[str] = None
    burned: float
    date: str


class WeightEntry(BaseModel):
    date: str
    val: float


class FoodDBItem(BaseModel):
    name: str
    cal: float
    protein: float
    carbs: float
    fat: float
    type: str


# ───────────────────────── PROFILE ─────────────────────────
@app.get("/api/profile")
def get_profile():
    conn = get_db()
    row = conn.execute("SELECT * FROM profile WHERE id = 1").fetchone()
    conn.close()
    if not row:
        return None
    return dict(row)


@app.post("/api/profile")
def save_profile(profile: Profile):
    conn = get_db()
    conn.execute("""
        INSERT INTO profile (id, name, age, weight, height, activity, goal)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, age=excluded.age, weight=excluded.weight,
            height=excluded.height, activity=excluded.activity, goal=excluded.goal
    """, (profile.name, profile.age, profile.weight, profile.height, profile.activity, profile.goal))
    conn.commit()
    conn.close()
    return {"status": "ok"}


# ───────────────────────── FOOD LOG ─────────────────────────
@app.get("/api/food-log")
def get_food_log(date: Optional[str] = None):
    conn = get_db()
    if date:
        rows = conn.execute("SELECT * FROM food_log WHERE date = ?", (date,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM food_log ORDER BY date DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/food-log")
def add_food_log(entry: FoodLogEntry):
    conn = get_db()
    conn.execute("""
        INSERT INTO food_log (id, meal, name, qty, cal, protein, carbs, fat, date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (entry.id, entry.meal, entry.name, entry.qty, entry.cal,
          entry.protein, entry.carbs, entry.fat, entry.date))
    conn.commit()
    _mark_logged(conn, entry.date)
    conn.close()
    return {"status": "ok"}


@app.delete("/api/food-log/{entry_id}")
def delete_food_log(entry_id: str):
    conn = get_db()
    conn.execute("DELETE FROM food_log WHERE id = ?", (entry_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}


# ───────────────────────── WORKOUT LOG ─────────────────────────
@app.get("/api/workout-log")
def get_workout_log(date: Optional[str] = None):
    conn = get_db()
    if date:
        rows = conn.execute("SELECT * FROM workout_log WHERE date = ?", (date,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM workout_log ORDER BY date DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/workout-log")
def add_workout_log(entry: WorkoutLogEntry):
    conn = get_db()
    conn.execute("""
        INSERT INTO workout_log (id, name, sets, reps, weight, burned, date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (entry.id, entry.name, entry.sets, entry.reps, entry.weight, entry.burned, entry.date))
    conn.commit()
    _mark_logged(conn, entry.date)
    conn.close()
    return {"status": "ok"}


@app.delete("/api/workout-log/{entry_id}")
def delete_workout_log(entry_id: str):
    conn = get_db()
    conn.execute("DELETE FROM workout_log WHERE id = ?", (entry_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}


# ───────────────────────── WEIGHT LOG ─────────────────────────
@app.get("/api/weight-log")
def get_weight_log():
    conn = get_db()
    rows = conn.execute("SELECT * FROM weight_log ORDER BY date ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/weight-log")
def log_weight(entry: WeightEntry):
    conn = get_db()
    conn.execute("""
        INSERT INTO weight_log (date, val) VALUES (?, ?)
        ON CONFLICT(date) DO UPDATE SET val = excluded.val
    """, (entry.date, entry.val))
    conn.commit()
    conn.close()
    return {"status": "ok"}


# ───────────────────────── FOOD DATABASE (admin) ─────────────────────────
@app.get("/api/food-db")
def get_food_db(q: Optional[str] = None):
    conn = get_db()
    if q:
        rows = conn.execute(
            "SELECT * FROM food_db WHERE name LIKE ? ORDER BY name", (f"%{q}%",)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM food_db ORDER BY name").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/food-db")
def add_food_db_item(item: FoodDBItem):
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO food_db (name, cal, protein, carbs, fat, type)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (item.name, item.cal, item.protein, item.carbs, item.fat, item.type))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Food item already exists")
    conn.close()
    return {"status": "ok"}


@app.delete("/api/food-db/{name}")
def delete_food_db_item(name: str):
    conn = get_db()
    conn.execute("DELETE FROM food_db WHERE name = ?", (name,))
    conn.commit()
    conn.close()
    return {"status": "ok"}


# ───────────────────────── STREAK ─────────────────────────
def _mark_logged(conn, date: str):
    row = conn.execute("SELECT logged_dates FROM streak WHERE id = 1").fetchone()
    dates = set(row["logged_dates"].split(",")) if row and row["logged_dates"] else set()
    dates.add(date)
    conn.execute("UPDATE streak SET logged_dates = ? WHERE id = 1", (",".join(sorted(dates)),))
    conn.commit()


@app.get("/api/streak")
def get_streak():
    conn = get_db()
    row = conn.execute("SELECT logged_dates FROM streak WHERE id = 1").fetchone()
    conn.close()
    dates = row["logged_dates"].split(",") if row and row["logged_dates"] else []
    return {"logged_dates": [d for d in dates if d]}


# ───────────────────────── HEALTH CHECK ─────────────────────────
@app.get("/")
def root():
    return {"status": "DietPrep API is running", "docs": "/docs"}
