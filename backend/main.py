from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import get_connection, initialize_database

app = FastAPI(
    title="Chronicle API",
    description="A personal activity and time-tracking application.",
    version="0.1.0",
)

# Create the database and tables when the backend starts.
initialize_database()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# The data we need when creating a task.
class TaskCreate(BaseModel):
    title: str
    category: str = "Other"
    scheduled_start: str | None = None
    scheduled_end: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    category: str | None = None
    scheduled_start: str | None = None
    scheduled_end: str | None = None
    is_completed: bool | None = None


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
    connection = get_connection()

    try:
        cursor = connection.execute(
            """
            INSERT INTO tasks (title, category, scheduled_start, scheduled_end)
            VALUES (?, ?, ?, ?)
            """,
            (
                task.title,
                task.category,
                task.scheduled_start,
                task.scheduled_end,
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
            allowed_fields = {
                "title",
                "category",
                "scheduled_start",
                "scheduled_end",
                "is_completed",
            }

            if not set(updates).issubset(allowed_fields):
                raise HTTPException(
                    status_code=400,
                    detail="Invalid fields",
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
