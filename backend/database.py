import os
import sqlite3
from pathlib import Path

DATABASE_PATH = Path(
    os.environ.get("CHRONICLE_DATABASE_PATH", Path(__file__).parent / "chronicle.db")
).expanduser()


def get_connection():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database():
    connection = get_connection()

    try:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'Other',
                scheduled_start TEXT,
                scheduled_end TEXT,
                is_completed BOOLEAN NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        task_columns = {
            row["name"]: row
            for row in connection.execute("PRAGMA table_info(tasks)").fetchall()
        }
        additive_columns = {
            "description": "TEXT NOT NULL DEFAULT ''",
            "priority": "TEXT NOT NULL DEFAULT 'medium'",
            "status": "TEXT NOT NULL DEFAULT 'not_started'",
            "due_date": "TEXT",
            "estimated_duration": "INTEGER",
            "completed_at": "TEXT",
        }
        for name, definition in additive_columns.items():
            if name not in task_columns:
                connection.execute(
                    f"ALTER TABLE tasks ADD COLUMN {name} {definition}"
                )

        connection.execute("""
            UPDATE tasks
            SET status = 'completed'
            WHERE is_completed = 1
              AND status != 'completed'
        """)
        connection.execute("""
            UPDATE tasks
            SET status = 'not_started'
            WHERE is_completed = 0
              AND status = 'completed'
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS activities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT 'Other',
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                task_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS time_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                source TEXT NOT NULL CHECK (source IN ('timer', 'manual')),
                task_id INTEGER,
                activity_id INTEGER,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
                FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL,
                CHECK (task_id IS NULL OR activity_id IS NULL),
                CHECK (source = 'timer' OR ended_at IS NOT NULL),
                CHECK (ended_at IS NULL OR julianday(ended_at) > julianday(started_at))
            )
        """)
        connection.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_time_sessions_single_active
            ON time_sessions(source)
            WHERE ended_at IS NULL
        """)
        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_time_sessions_started_at
            ON time_sessions(started_at)
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS journal_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entry_date TEXT NOT NULL UNIQUE,
                content TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS reminders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                due_at TEXT NOT NULL,
                task_id INTEGER,
                notified_at TEXT,
                dismissed_at TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
            )
        """)
        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_reminders_due_at
            ON reminders(due_at)
        """)

        connection.commit()
    finally:
        connection.close()