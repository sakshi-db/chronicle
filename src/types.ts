export type Task = {
  id: number
  title: string
  description: string
  category: string
  priority: 'low' | 'medium' | 'high'
  status: 'not_started' | 'in_progress' | 'completed'
  due_date: string | null
  estimated_duration: number | null
  scheduled_start: string | null
  scheduled_end: string | null
  is_completed: boolean | number
  completed_at?: string | null
  created_at?: string
}

export type Activity = {
  id: number
  title: string
  notes: string
  category: string
  start_time: string
  end_time: string
  task_id: number | null
  created_at?: string
}

export type TimeSession = {
  id: number
  started_at: string
  ended_at: string | null
  source: 'timer' | 'manual'
  task_id: number | null
  activity_id: number | null
}

export type JournalEntry = {
  id: number
  entry_date: string
  content: string
  created_at: string
  updated_at: string
}

export type Reminder = {
  id: number
  title: string
  due_at: string
  task_id: number | null
  task_title?: string | null
  notified_at: string | null
  dismissed_at: string | null
}

export type InsightDay = {
  date: string
  tasks_completed: number
  tracked_seconds: number
  sessions: number
  planned_minutes: number
}

export type Insights = {
  date: string
  current_completed_tasks: number
  completion_history_available: boolean
  today: {
    tasks_due: number
    tasks_completed: number
    tracked_seconds: number
    sessions: number
    planned_minutes: number
  }
  week: {
    start_date: string
    end_date: string
    tasks_completed: number
    tracked_seconds: number
    sessions: number
    planned_minutes: number
    days: InsightDay[]
  }
}
