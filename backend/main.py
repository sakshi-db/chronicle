import os
from datetime import date, datetime, time, timedelta
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from database import get_connection, initialize_database

app = FastAPI(
    title="Chronicle API",
    description="A personal task and schedule management application.",
    version="0.1.0",
)

# Create the database and tables when the backend starts.
initialize_database()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.environ.get(
            "CHRONICLE_CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# The data we need when creating a task.
class TaskCreate(BaseModel):
    title: str = Field(min_length=1)
    description: str = ""
    category: str = "Other"
    priority: str = "medium"
    status: str = "not_started"
    due_date: str | None = None
    estimated_duration: int | None = Field(default=None, ge=1)
    scheduled_start: str | None = None
    scheduled_end: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    description: str | None = None
    category: str | None = None
    priority: str | None = None
    status: str | None = None
    due_date: str | None = None
    estimated_duration: int | None = Field(default=None, ge=1)
    scheduled_start: str | None = None
    scheduled_end: str | None = None
    is_completed: bool | None = None


class ActivityCreate(BaseModel):
    title: str = Field(min_length=1)
    notes: str = ""
    category: str = "Other"
    start_time: str
    end_time: str
    task_id: int | None = None


class ActivityUpdate(BaseModel):
    title: str | None = None
    notes: str | None = None
    category: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    task_id: int | None = None


class TimeSessionStart(BaseModel):
    task_id: int | None = None
    activity_id: int | None = None


class TimeSessionCreate(TimeSessionStart):
    started_at: str
    ended_at: str


class JournalEntrySave(BaseModel):
    content: str = Field(min_length=1, max_length=20000)


class ReminderCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    due_at: str
    task_id: int | None = None


class ReminderUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    due_at: str | None = None
    task_id: int | None = None


def parse_local_datetime(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="A valid ISO timestamp is required")
    return parsed.astimezone()


def serialize_datetime(value: datetime) -> str:
    return value.astimezone().isoformat()


def now_local() -> datetime:
    return datetime.now().astimezone()


def validate_association(connection, task_id: int | None, activity_id: int | None):
    if task_id is not None and activity_id is not None:
        raise HTTPException(status_code=422, detail="Link a session to either a task or an activity")
    if task_id is not None and connection.execute(
        "SELECT id FROM tasks WHERE id = ?", (task_id,)
    ).fetchone() is None:
        raise HTTPException(status_code=404, detail="Linked task not found")
    if activity_id is not None and connection.execute(
        "SELECT id FROM activities WHERE id = ?", (activity_id,)
    ).fetchone() is None:
        raise HTTPException(status_code=404, detail="Linked activity not found")


def has_time_overlap(connection, started_at: str, ended_at: str) -> bool:
    return connection.execute(
        """
        SELECT 1 FROM time_sessions
        WHERE julianday(started_at) < julianday(?)
          AND (ended_at IS NULL OR julianday(ended_at) > julianday(?))
        LIMIT 1
        """,
        (ended_at, started_at),
    ).fetchone() is not None


@app.get("/")
def home():
    return {
        "message": "Chronicle backend is running!",
        "status": "online",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "application": "Chronicle",
    }


# Get all saved tasks.
@app.get("/tasks")
def get_tasks():
    connection = get_connection()

    try:
        tasks = connection.execute("SELECT * FROM tasks ORDER BY id DESC").fetchall()

        return [dict(task) for task in tasks]

    finally:
        connection.close()


# Save a new task.
@app.post("/tasks")
def create_task(task: TaskCreate):
    title = task.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Task title cannot be blank")
    if task.priority not in {"low", "medium", "high"}:
        raise HTTPException(status_code=400, detail="Priority must be low, medium, or high")
    if task.status not in {"not_started", "in_progress", "completed"}:
        raise HTTPException(status_code=400, detail="Invalid task status")

    connection = get_connection()

    try:
        cursor = connection.execute(
            """
            INSERT INTO tasks (
                title, description, category, priority, status, due_date,
                estimated_duration, scheduled_start, scheduled_end, is_completed,
                completed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                title,
                task.description,
                task.category,
                task.priority,
                task.status,
                task.due_date,
                task.estimated_duration,
                task.scheduled_start,
                task.scheduled_end,
                task.status == "completed",
                serialize_datetime(now_local()) if task.status == "completed" else None,
            ),
        )

        connection.commit()

        new_task = connection.execute(
            "SELECT * FROM tasks WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()

        return dict(new_task)

    finally:
        connection.close()


# Update an existing task.
@app.patch("/tasks/{task_id}")
def update_task(task_id: int, task: TaskUpdate):
    connection = get_connection()

    try:
        existing_task = connection.execute(
            "SELECT * FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()

        if existing_task is None:
            raise HTTPException(
                status_code=404,
                detail="Task not found",
            )

        updates = task.model_dump(exclude_unset=True)

        if updates:
            if "title" in updates:
                if updates["title"] is None or not updates["title"].strip():
                    raise HTTPException(status_code=422, detail="Task title cannot be blank")
                updates["title"] = updates["title"].strip()
            allowed_fields = {
                "title",
                "description",
                "category",
                "priority",
                "status",
                "due_date",
                "estimated_duration",
                "scheduled_start",
                "scheduled_end",
                "is_completed",
            }

            if not set(updates).issubset(allowed_fields):
                raise HTTPException(
                    status_code=400,
                    detail="Invalid fields",
                )

            if "priority" in updates and updates["priority"] not in {"low", "medium", "high"}:
                raise HTTPException(status_code=400, detail="Priority must be low, medium, or high")
            if "status" in updates and updates["status"] not in {"not_started", "in_progress", "completed"}:
                raise HTTPException(status_code=400, detail="Invalid task status")
            if "status" in updates:
                is_completed = updates["status"] == "completed"
                updates["is_completed"] = is_completed
                if is_completed:
                    updates["completed_at"] = existing_task["completed_at"] or serialize_datetime(now_local())
                else:
                    updates["completed_at"] = None
            elif "is_completed" in updates:
                is_completed = updates["is_completed"]
                updates["status"] = "completed" if is_completed else "not_started"
                updates["completed_at"] = (
                    existing_task["completed_at"] or serialize_datetime(now_local())
                    if is_completed
                    else None
                )

            assignments = ", ".join(f"{field} = ?" for field in updates)

            values = list(updates.values())
            values.append(task_id)

            connection.execute(
                f"UPDATE tasks SET {assignments} WHERE id = ?",
                values,
            )

            connection.commit()

        updated_task = connection.execute(
            "SELECT * FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()

        return dict(updated_task)

    finally:
        connection.close()


# Delete a task.
@app.delete("/tasks/{task_id}")
def delete_task(task_id: int):
    connection = get_connection()

    try:
        cursor = connection.execute(
            "DELETE FROM tasks WHERE id = ?",
            (task_id,),
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Task not found",
            )

        connection.commit()

        return {
            "message": "Task deleted successfully",
            "id": task_id,
        }

    finally:
        connection.close()


def validate_activity(activity):
    try:
        start = datetime.fromisoformat(activity.start_time)
        end = datetime.fromisoformat(activity.end_time)
    except (AttributeError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Start and end times must be valid ISO timestamps")
    try:
        ends_after_start = end > start
    except TypeError:
        raise HTTPException(status_code=400, detail="Start and end times must use compatible time zones")
    if not ends_after_start:
        raise HTTPException(status_code=400, detail="End time must be after start time")


@app.get("/activities")
def get_activities(
    date_value: str | None = Query(default=None, alias="date"),
):
    connection = get_connection()
    try:
        if date_value:
            try:
                datetime.strptime(date_value, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=400, detail="Date must use YYYY-MM-DD")
            activities = connection.execute(
                """
                SELECT * FROM activities
                WHERE substr(start_time, 1, 10) = ?
                ORDER BY start_time ASC
                """,
                (date_value,),
            ).fetchall()
        else:
            activities = connection.execute(
                "SELECT * FROM activities ORDER BY start_time ASC"
            ).fetchall()
        return [dict(activity) for activity in activities]
    finally:
        connection.close()


@app.post("/activities")
def create_activity(activity: ActivityCreate):
    title = activity.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Activity title cannot be blank")
    validate_activity(activity)
    connection = get_connection()
    try:
        if activity.task_id is not None:
            task = connection.execute(
                "SELECT id FROM tasks WHERE id = ?", (activity.task_id,)
            ).fetchone()
            if task is None:
                raise HTTPException(status_code=404, detail="Linked task not found")

        cursor = connection.execute(
            """
            INSERT INTO activities (title, notes, category, start_time, end_time, task_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                title,
                activity.notes,
                activity.category,
                activity.start_time,
                activity.end_time,
                activity.task_id,
            ),
        )
        connection.commit()
        created = connection.execute(
            "SELECT * FROM activities WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
        return dict(created)
    finally:
        connection.close()


@app.patch("/activities/{activity_id}")
def update_activity(activity_id: int, activity: ActivityUpdate):
    connection = get_connection()
    try:
        existing = connection.execute(
            "SELECT * FROM activities WHERE id = ?", (activity_id,)
        ).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="Activity not found")

        updates = activity.model_dump(exclude_unset=True)
        if "title" in updates:
            if updates["title"] is None or not updates["title"].strip():
                raise HTTPException(status_code=422, detail="Activity title cannot be blank")
            updates["title"] = updates["title"].strip()
        if "task_id" in updates and updates["task_id"] is not None:
            task = connection.execute(
                "SELECT id FROM tasks WHERE id = ?", (updates["task_id"],)
            ).fetchone()
            if task is None:
                raise HTTPException(status_code=404, detail="Linked task not found")

        merged = dict(existing)
        merged.update(updates)
        validate_activity(type("ActivityValue", (), merged))

        if updates:
            assignments = ", ".join(f"{field} = ?" for field in updates)
            values = list(updates.values()) + [activity_id]
            connection.execute(
                f"UPDATE activities SET {assignments} WHERE id = ?", values
            )
            connection.commit()

        updated = connection.execute(
            "SELECT * FROM activities WHERE id = ?", (activity_id,)
        ).fetchone()
        return dict(updated)
    finally:
        connection.close()


@app.delete("/activities/{activity_id}")
def delete_activity(activity_id: int):
    connection = get_connection()
    try:
        cursor = connection.execute(
            "DELETE FROM activities WHERE id = ?", (activity_id,)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Activity not found")
        connection.commit()
        return {"message": "Activity deleted successfully", "id": activity_id}
    finally:
        connection.close()


@app.get("/dashboard")
def get_dashboard(date_value: str = Query(default=None, alias="date")):
    today = date_value or date.today().isoformat()
    try:
        datetime.strptime(today, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must use YYYY-MM-DD")

    connection = get_connection()
    try:
        tasks = [
            dict(row)
            for row in connection.execute("SELECT * FROM tasks").fetchall()
        ]
        activities = [
            dict(row)
            for row in connection.execute(
                """
                SELECT * FROM activities
                WHERE substr(start_time, 1, 10) = ?
                ORDER BY start_time ASC
                """,
                (today,),
            ).fetchall()
        ]
        due_today = [
            task for task in tasks
            if task["due_date"] and task["due_date"][:10] == today
        ]
        overdue = [
            task for task in tasks
            if task["due_date"]
            and task["due_date"][:10] < today
            and not task["is_completed"]
        ]
        upcoming = [
            task for task in tasks
            if task["due_date"]
            and task["due_date"][:10] > today
            and not task["is_completed"]
        ]
        planned_minutes = sum(
            max(
                0,
                int(
                    (
                        datetime.fromisoformat(activity["end_time"])
                        - datetime.fromisoformat(activity["start_time"])
                    ).total_seconds()
                    // 60
                ),
            )
            for activity in activities
        )

        return {
            "date": today,
            "task_summary": {
                "total": len(tasks),
                "completed": sum(bool(task["is_completed"]) for task in tasks),
                "in_progress": sum(task["status"] == "in_progress" for task in tasks),
                "due_today": len(due_today),
                "overdue": len(overdue),
                "upcoming": len(upcoming),
            },
            "planned_minutes": planned_minutes,
            "activities": activities,
            "due_today": due_today,
            "overdue": overdue,
            "upcoming": upcoming[:5],
        }
    finally:
        connection.close()


@app.get("/time-sessions")
def get_time_sessions():
    connection = get_connection()
    try:
        rows = connection.execute(
            "SELECT * FROM time_sessions ORDER BY started_at DESC LIMIT 100"
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


@app.post("/time-sessions/start")
def start_timer(session: TimeSessionStart):
    connection = get_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        active = connection.execute(
            "SELECT id FROM time_sessions WHERE ended_at IS NULL"
        ).fetchone()
        if active is not None:
            raise HTTPException(status_code=409, detail="A timer is already running")

        validate_association(connection, session.task_id, session.activity_id)
        started_at = serialize_datetime(now_local())
        cursor = connection.execute(
            """
            INSERT INTO time_sessions (started_at, source, task_id, activity_id)
            VALUES (?, 'timer', ?, ?)
            """,
            (started_at, session.task_id, session.activity_id),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM time_sessions WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
        return dict(row)
    finally:
        connection.close()


@app.post("/time-sessions/stop")
def stop_timer():
    connection = get_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        active = connection.execute(
            "SELECT * FROM time_sessions WHERE ended_at IS NULL"
        ).fetchone()
        if active is None:
            raise HTTPException(status_code=409, detail="No timer is currently running")

        ended_at = now_local()
        started_at = parse_local_datetime(active["started_at"])
        if ended_at <= started_at:
            raise HTTPException(status_code=400, detail="Timer duration must be positive")

        cursor = connection.execute(
            "UPDATE time_sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL",
            (serialize_datetime(ended_at), active["id"]),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=409, detail="The timer has already been stopped")
        connection.commit()
        row = connection.execute(
            "SELECT * FROM time_sessions WHERE id = ?", (active["id"],)
        ).fetchone()
        return dict(row)
    finally:
        connection.close()


@app.post("/time-sessions")
def create_manual_time_session(session: TimeSessionCreate):
    started_at = parse_local_datetime(session.started_at)
    ended_at = parse_local_datetime(session.ended_at)
    now = now_local()
    if ended_at <= started_at:
        raise HTTPException(status_code=400, detail="End time must be after start time")
    if ended_at > now:
        raise HTTPException(status_code=400, detail="Manual sessions cannot end in the future")

    connection = get_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")
        validate_association(connection, session.task_id, session.activity_id)
        started_value = serialize_datetime(started_at)
        ended_value = serialize_datetime(ended_at)
        if has_time_overlap(connection, started_value, ended_value):
            raise HTTPException(status_code=409, detail="Time sessions cannot overlap")

        cursor = connection.execute(
            """
            INSERT INTO time_sessions
                (started_at, ended_at, source, task_id, activity_id)
            VALUES (?, ?, 'manual', ?, ?)
            """,
            (started_value, ended_value, session.task_id, session.activity_id),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM time_sessions WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
        return dict(row)
    finally:
        connection.close()


@app.delete("/time-sessions/{session_id}")
def delete_time_session(session_id: int):
    connection = get_connection()
    try:
        row = connection.execute(
            "SELECT ended_at FROM time_sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Time session not found")
        if row["ended_at"] is None:
            raise HTTPException(status_code=409, detail="Stop the timer before deleting its session")
        connection.execute("DELETE FROM time_sessions WHERE id = ?", (session_id,))
        connection.commit()
        return {"message": "Time session deleted successfully", "id": session_id}
    finally:
        connection.close()


def parse_entry_date(value: str) -> date:
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must use YYYY-MM-DD")
    if parsed.isoformat() != value:
        raise HTTPException(status_code=400, detail="Date must use YYYY-MM-DD")
    return parsed


@app.get("/journal/{entry_date}")
def get_journal_entry(entry_date: str):
    parse_entry_date(entry_date)
    connection = get_connection()
    try:
        row = connection.execute(
            "SELECT * FROM journal_entries WHERE entry_date = ?", (entry_date,)
        ).fetchone()
        return dict(row) if row is not None else None
    finally:
        connection.close()


@app.put("/journal/{entry_date}")
def save_journal_entry(entry_date: str, entry: JournalEntrySave):
    parse_entry_date(entry_date)
    content = entry.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="Journal entry cannot be blank")
    now = serialize_datetime(now_local())
    connection = get_connection()
    try:
        connection.execute(
            """
            INSERT INTO journal_entries (entry_date, content, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(entry_date) DO UPDATE SET
                content = excluded.content,
                updated_at = excluded.updated_at
            """,
            (entry_date, content, now, now),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM journal_entries WHERE entry_date = ?", (entry_date,)
        ).fetchone()
        return dict(row)
    finally:
        connection.close()


@app.delete("/journal/{entry_date}")
def delete_journal_entry(entry_date: str):
    parse_entry_date(entry_date)
    connection = get_connection()
    try:
        cursor = connection.execute(
            "DELETE FROM journal_entries WHERE entry_date = ?", (entry_date,)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Journal entry not found")
        connection.commit()
        return {"message": "Journal entry deleted successfully", "date": entry_date}
    finally:
        connection.close()


def local_midnight(day: date) -> datetime:
    return datetime.combine(day, time.min).astimezone()


def split_session_by_day(started_at: datetime, ended_at: datetime, totals: dict[str, int]):
    cursor = started_at
    while cursor < ended_at:
        next_day = cursor.date() + timedelta(days=1)
        boundary = local_midnight(next_day)
        segment_end = min(ended_at, boundary)
        key = cursor.date().isoformat()
        totals[key] = totals.get(key, 0) + max(
            0, int((segment_end - cursor).total_seconds())
        )
        cursor = segment_end


@app.get("/insights")
def get_insights(date_value: str | None = Query(default=None, alias="date")):
    today = parse_entry_date(date_value or date.today().isoformat())
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=7)
    now = now_local()
    week_start_at = local_midnight(week_start)
    week_end_at = local_midnight(week_end)

    connection = get_connection()
    try:
        tasks = connection.execute(
            "SELECT due_date, status, completed_at FROM tasks"
        ).fetchall()
        sessions = connection.execute(
            """
            SELECT started_at, ended_at FROM time_sessions
            WHERE julianday(started_at) < julianday(?)
              AND (ended_at IS NULL OR julianday(ended_at) > julianday(?))
            """,
            (serialize_datetime(week_end_at), serialize_datetime(week_start_at)),
        ).fetchall()
        activities = connection.execute(
            """
            SELECT start_time, end_time FROM activities
            WHERE substr(start_time, 1, 10) >= ?
              AND substr(start_time, 1, 10) < ?
            """,
            (week_start.isoformat(), week_end.isoformat()),
        ).fetchall()

        tracked_by_day: dict[str, int] = {}
        session_count_by_day: dict[str, int] = {}
        for session in sessions:
            start = parse_local_datetime(session["started_at"])
            end = parse_local_datetime(session["ended_at"]) if session["ended_at"] else now
            start = max(start, week_start_at)
            end = min(end, week_end_at)
            if end <= start:
                continue
            split_session_by_day(start, end, tracked_by_day)
            session_count_by_day[start.date().isoformat()] = (
                session_count_by_day.get(start.date().isoformat(), 0) + 1
            )

        completed_by_day: dict[str, int] = {}
        completion_history_available = False
        current_completed = 0
        tasks_due_today = 0
        for task in tasks:
            if task["status"] == "completed":
                current_completed += 1
            if task["due_date"] and task["due_date"][:10] == today.isoformat():
                tasks_due_today += 1
            if task["completed_at"]:
                completed_date = parse_local_datetime(task["completed_at"]).date().isoformat()
                completed_by_day[completed_date] = completed_by_day.get(completed_date, 0) + 1
                completion_history_available = True

        planned_by_day: dict[str, int] = {}
        for activity in activities:
            start = parse_local_datetime(activity["start_time"])
            end = parse_local_datetime(activity["end_time"])
            day_key = start.date().isoformat()
            planned_by_day[day_key] = planned_by_day.get(day_key, 0) + max(
                0, int((end - start).total_seconds() // 60)
            )

        days = [
            {
                "date": (week_start + timedelta(days=offset)).isoformat(),
                "tasks_completed": completed_by_day.get(
                    (week_start + timedelta(days=offset)).isoformat(), 0
                ),
                "tracked_seconds": tracked_by_day.get(
                    (week_start + timedelta(days=offset)).isoformat(), 0
                ),
                "sessions": session_count_by_day.get(
                    (week_start + timedelta(days=offset)).isoformat(), 0
                ),
                "planned_minutes": planned_by_day.get(
                    (week_start + timedelta(days=offset)).isoformat(), 0
                ),
            }
            for offset in range(7)
        ]
        tracked_today = tracked_by_day.get(today.isoformat(), 0)
        tracked_week = sum(day["tracked_seconds"] for day in days)
        completed_today = completed_by_day.get(today.isoformat(), 0)
        completed_week = sum(day["tasks_completed"] for day in days)
        planned_today = planned_by_day.get(today.isoformat(), 0)

        return {
            "date": today.isoformat(),
            "current_completed_tasks": current_completed,
            "completion_history_available": completion_history_available,
            "today": {
                "tasks_due": tasks_due_today,
                "tasks_completed": completed_today,
                "tracked_seconds": tracked_today,
                "sessions": session_count_by_day.get(today.isoformat(), 0),
                "planned_minutes": planned_today,
            },
            "week": {
                "start_date": week_start.isoformat(),
                "end_date": (week_end - timedelta(days=1)).isoformat(),
                "tasks_completed": completed_week,
                "tracked_seconds": tracked_week,
                "sessions": sum(day["sessions"] for day in days),
                "planned_minutes": sum(day["planned_minutes"] for day in days),
                "days": days,
            },
        }
    finally:
        connection.close()


@app.get("/reminders")
def get_reminders():
    connection = get_connection()
    try:
        rows = connection.execute(
            """
            SELECT reminders.*, tasks.title AS task_title
            FROM reminders
            LEFT JOIN tasks ON tasks.id = reminders.task_id
            WHERE reminders.dismissed_at IS NULL
            ORDER BY reminders.due_at ASC
            """
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


@app.get("/reminders/due")
def get_due_reminders():
    now = serialize_datetime(now_local())
    connection = get_connection()
    try:
        rows = connection.execute(
            """
            SELECT * FROM reminders
            WHERE dismissed_at IS NULL
              AND notified_at IS NULL
              AND julianday(due_at) <= julianday(?)
            ORDER BY due_at ASC
            """,
            (now,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


@app.post("/reminders")
def create_reminder(reminder: ReminderCreate):
    due_at = serialize_datetime(parse_local_datetime(reminder.due_at))
    title = reminder.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Reminder title cannot be blank")

    connection = get_connection()
    try:
        validate_association(connection, reminder.task_id, None)
        cursor = connection.execute(
            "INSERT INTO reminders (title, due_at, task_id) VALUES (?, ?, ?)",
            (title, due_at, reminder.task_id),
        )
        connection.commit()
        row = connection.execute(
            """
            SELECT reminders.*, tasks.title AS task_title
            FROM reminders LEFT JOIN tasks ON tasks.id = reminders.task_id
            WHERE reminders.id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()
        return dict(row)
    finally:
        connection.close()


@app.patch("/reminders/{reminder_id}")
def update_reminder(reminder_id: int, reminder: ReminderUpdate):
    updates = reminder.model_dump(exclude_unset=True)
    if "title" in updates:
        if updates["title"] is None or not updates["title"].strip():
            raise HTTPException(status_code=422, detail="Reminder title cannot be blank")
        updates["title"] = updates["title"].strip()
    if "due_at" in updates:
        if updates["due_at"] is None:
            raise HTTPException(status_code=422, detail="Reminder due time cannot be blank")
        updates["due_at"] = serialize_datetime(parse_local_datetime(updates["due_at"]))

    connection = get_connection()
    try:
        existing = connection.execute(
            "SELECT id FROM reminders WHERE id = ?", (reminder_id,)
        ).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="Reminder not found")
        if "task_id" in updates:
            validate_association(connection, updates["task_id"], None)
        if updates:
            assignments = ", ".join(f"{field} = ?" for field in updates)
            values = list(updates.values())
            values.extend((reminder_id,))
            connection.execute(
                f"""
                UPDATE reminders SET {assignments},
                    notified_at = NULL, dismissed_at = NULL
                WHERE id = ?
                """,
                values,
            )
            connection.commit()
        row = connection.execute(
            """
            SELECT reminders.*, tasks.title AS task_title
            FROM reminders LEFT JOIN tasks ON tasks.id = reminders.task_id
            WHERE reminders.id = ?
            """,
            (reminder_id,),
        ).fetchone()
        return dict(row)
    finally:
        connection.close()


@app.post("/reminders/{reminder_id}/notify")
def notify_reminder(reminder_id: int):
    now = serialize_datetime(now_local())
    connection = get_connection()
    try:
        cursor = connection.execute(
            """
            UPDATE reminders SET notified_at = ?
            WHERE id = ? AND notified_at IS NULL AND dismissed_at IS NULL
              AND julianday(due_at) <= julianday(?)
            """,
            (now, reminder_id, now),
        )
        connection.commit()
        if cursor.rowcount == 0:
            exists = connection.execute(
                "SELECT id FROM reminders WHERE id = ?", (reminder_id,)
            ).fetchone()
            if exists is None:
                raise HTTPException(status_code=404, detail="Reminder not found")
            return {"notified": False}
        row = connection.execute(
            "SELECT * FROM reminders WHERE id = ?", (reminder_id,)
        ).fetchone()
        return {"notified": True, "reminder": dict(row)}
    finally:
        connection.close()


@app.post("/reminders/{reminder_id}/dismiss")
def dismiss_reminder(reminder_id: int):
    connection = get_connection()
    try:
        cursor = connection.execute(
            """
            UPDATE reminders SET dismissed_at = ?
            WHERE id = ? AND dismissed_at IS NULL
            """,
            (serialize_datetime(now_local()), reminder_id),
        )
        if cursor.rowcount == 0 and connection.execute(
            "SELECT id FROM reminders WHERE id = ?", (reminder_id,)
        ).fetchone() is None:
            raise HTTPException(status_code=404, detail="Reminder not found")
        connection.commit()
        return {"message": "Reminder dismissed", "id": reminder_id}
    finally:
        connection.close()


@app.delete("/reminders/{reminder_id}")
def delete_reminder(reminder_id: int):
    connection = get_connection()
    try:
        cursor = connection.execute(
            "DELETE FROM reminders WHERE id = ?", (reminder_id,)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Reminder not found")
        connection.commit()
        return {"message": "Reminder deleted successfully", "id": reminder_id}
    finally:
        connection.close()
