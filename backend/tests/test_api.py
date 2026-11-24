import os
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path

TEST_ROOT = tempfile.TemporaryDirectory()
os.environ["CHRONICLE_DATABASE_PATH"] = str(Path(TEST_ROOT.name) / "import.db")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import database
import main
from fastapi import HTTPException


class ChronicleApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        database.DATABASE_PATH = Path(self.temp_dir.name) / "test.db"
        database.initialize_database()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_timer_survives_initialization_and_rejects_duplicate_start(self):
        started = main.start_timer(main.TimeSessionStart())
        self.assertIsNone(started["ended_at"])

        with self.assertRaises(HTTPException) as duplicate:
            main.start_timer(main.TimeSessionStart())
        self.assertEqual(duplicate.exception.status_code, 409)

        database.initialize_database()
        sessions = main.get_time_sessions()
        self.assertEqual(sessions[0]["id"], started["id"])
        self.assertIsNone(sessions[0]["ended_at"])

        stopped = main.stop_timer()
        self.assertIsNotNone(stopped["ended_at"])
        with self.assertRaises(HTTPException) as already_stopped:
            main.stop_timer()
        self.assertEqual(already_stopped.exception.status_code, 409)

    def test_database_path_creates_missing_parent_directories(self):
        database.DATABASE_PATH = Path(self.temp_dir.name) / "nested" / "data" / "chronicle.db"
        database.initialize_database()
        self.assertTrue(database.DATABASE_PATH.is_file())

    def test_task_and_activity_titles_cannot_be_blank(self):
        with self.assertRaises(HTTPException) as blank_task:
            main.create_task(main.TaskCreate(title="   "))
        self.assertEqual(blank_task.exception.status_code, 422)

        with self.assertRaises(HTTPException) as blank_activity:
            main.create_activity(
                main.ActivityCreate(
                    title=" ",
                    start_time="2026-11-24T10:00",
                    end_time="2026-11-24T11:00",
                )
            )
        self.assertEqual(blank_activity.exception.status_code, 422)

    def test_manual_entries_reject_overlap_and_future_end(self):
        now = datetime.now().astimezone()
        start = (now - timedelta(hours=2)).isoformat()
        end = (now - timedelta(hours=1)).isoformat()
        entry = main.create_manual_time_session(
            main.TimeSessionCreate(started_at=start, ended_at=end)
        )
        self.assertEqual(entry["source"], "manual")

        with self.assertRaises(HTTPException) as overlap:
            main.create_manual_time_session(
                main.TimeSessionCreate(
                    started_at=(now - timedelta(hours=1, minutes=30)).isoformat(),
                    ended_at=(now - timedelta(minutes=30)).isoformat(),
                )
            )
        self.assertEqual(overlap.exception.status_code, 409)

        with self.assertRaises(HTTPException) as future:
            main.create_manual_time_session(
                main.TimeSessionCreate(
                    started_at=(now + timedelta(minutes=1)).isoformat(),
                    ended_at=(now + timedelta(minutes=2)).isoformat(),
                )
            )
        self.assertEqual(future.exception.status_code, 400)

    def test_journal_upserts_by_date_and_rejects_blank_content(self):
        day = datetime.now().date().isoformat()
        first = main.save_journal_entry(day, main.JournalEntrySave(content="First note"))
        updated = main.save_journal_entry(day, main.JournalEntrySave(content="Revised note"))
        self.assertEqual(first["id"], updated["id"])
        self.assertEqual(main.get_journal_entry(day)["content"], "Revised note")

        with self.assertRaises(HTTPException) as blank:
            main.save_journal_entry(day, main.JournalEntrySave(content="   "))
        self.assertEqual(blank.exception.status_code, 422)

        self.assertEqual(main.delete_journal_entry(day)["date"], day)
        self.assertIsNone(main.get_journal_entry(day))

    def test_insights_use_new_completion_and_tracked_time_records(self):
        today = datetime.now().date().isoformat()
        task = main.create_task(main.TaskCreate(title="Completed today", status="completed"))
        now = datetime.now().astimezone()
        main.create_manual_time_session(
            main.TimeSessionCreate(
                started_at=(now - timedelta(hours=2)).isoformat(),
                ended_at=(now - timedelta(hours=1)).isoformat(),
                task_id=task["id"],
            )
        )

        insights = main.get_insights(today)
        self.assertEqual(insights["today"]["tasks_completed"], 1)
        self.assertEqual(insights["today"]["tracked_seconds"], 3600)
        self.assertEqual(insights["week"]["tasks_completed"], 1)
        self.assertTrue(insights["completion_history_available"])

        reopened = main.update_task(task["id"], main.TaskUpdate(status="not_started"))
        self.assertIsNone(reopened["completed_at"])

    def test_deleting_linked_task_or_activity_preserves_records(self):
        task = main.create_task(main.TaskCreate(title="Linked task"))
        now = datetime.now().astimezone()
        main.create_manual_time_session(
            main.TimeSessionCreate(
                started_at=(now - timedelta(hours=4)).isoformat(),
                ended_at=(now - timedelta(hours=3)).isoformat(),
                task_id=task["id"],
            )
        )
        reminder = main.create_reminder(
            main.ReminderCreate(
                title="Linked reminder",
                due_at=(now + timedelta(hours=1)).isoformat(),
                task_id=task["id"],
            )
        )

        main.delete_task(task["id"])
        self.assertIsNone(main.get_time_sessions()[0]["task_id"])
        self.assertIsNone(main.get_reminders()[0]["task_id"])
        self.assertEqual(main.get_reminders()[0]["id"], reminder["id"])

        day = date.today().isoformat()
        activity = main.create_activity(
            main.ActivityCreate(
                title="Linked schedule block",
                start_time=f"{day}T10:00",
                end_time=f"{day}T11:00",
            )
        )
        main.create_manual_time_session(
            main.TimeSessionCreate(
                started_at=(now - timedelta(hours=2)).isoformat(),
                ended_at=(now - timedelta(hours=1)).isoformat(),
                activity_id=activity["id"],
            )
        )
        main.delete_activity(activity["id"])
        self.assertTrue(
            all(session["activity_id"] is None for session in main.get_time_sessions())
        )

    def test_reminders_are_persisted_notified_once_and_dismissible(self):
        now = datetime.now().astimezone()
        reminder = main.create_reminder(
            main.ReminderCreate(
                title="Due now",
                due_at=(now - timedelta(seconds=1)).isoformat(),
            )
        )
        self.assertEqual(main.get_due_reminders()[0]["id"], reminder["id"])

        notified = main.notify_reminder(reminder["id"])
        self.assertTrue(notified["notified"])
        self.assertFalse(main.notify_reminder(reminder["id"])["notified"])
        self.assertTrue(main.get_reminders()[0]["notified_at"])

        main.dismiss_reminder(reminder["id"])
        self.assertEqual(main.get_reminders(), [])

    def test_additive_migration_preserves_legacy_task_and_activity(self):
        connection = database.get_connection()
        try:
            connection.execute("DROP TABLE activities")
            connection.execute("DROP TABLE tasks")
            connection.execute("""
                CREATE TABLE tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'Other',
                    scheduled_start TEXT,
                    scheduled_end TEXT,
                    is_completed BOOLEAN NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            connection.execute(
                "INSERT INTO tasks (title, is_completed) VALUES ('Existing task', 1)"
            )
            connection.execute("""
                CREATE TABLE activities (
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
            legacy_day = date.today().isoformat()
            connection.execute(
                """
                INSERT INTO activities (title, start_time, end_time, task_id)
                VALUES (?, ?, ?, 1)
                """,
                ("Existing block", f"{legacy_day}T10:00", f"{legacy_day}T11:00"),
            )
            connection.commit()
        finally:
            connection.close()

        database.initialize_database()
        task = main.get_tasks()[0]
        activity = main.get_activities(date_value=date.today().isoformat())[0]
        self.assertEqual(task["title"], "Existing task")
        self.assertEqual(task["status"], "completed")
        self.assertIsNone(task["completed_at"])
        self.assertEqual(activity["title"], "Existing block")
        self.assertEqual(activity["task_id"], task["id"])


if __name__ == "__main__":
    unittest.main()
