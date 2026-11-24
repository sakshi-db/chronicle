import { useEffect, useLayoutEffect, useState, type FormEvent } from 'react'
import { apiRequest } from './api'
import { InsightsPage, JournalPage, RemindersPage, TimeTrackingPage } from './feature-pages'
import type { Activity, Reminder, Task } from './types'
import './App.css'

const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')

type Dashboard = {
  date: string
  task_summary: {
    total: number
    completed: number
    in_progress: number
    due_today: number
    overdue: number
    upcoming: number
  }
  planned_minutes: number
  activities: Activity[]
  due_today: Task[]
  overdue: Task[]
  upcoming: Task[]
}

type Page = 'Overview' | 'Tasks' | 'Schedule' | 'Reminders' | 'Time' | 'Journal' | 'Insights' | 'Settings'
type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'chronicle-theme'

function getSavedTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch (error) {
    console.error('Could not read the saved theme preference.', error)
    return 'light'
  }
}

const navigationGroups: { label: string; items: { page: Page; index: string }[] }[] = [
  {
    label: 'Plan',
    items: [
      { page: 'Overview', index: '01' },
      { page: 'Tasks', index: '02' },
      { page: 'Schedule', index: '03' },
      { page: 'Reminders', index: '04' },
    ],
  },
  {
    label: 'Reflect',
    items: [
      { page: 'Time', index: '05' },
      { page: 'Journal', index: '06' },
      { page: 'Insights', index: '07' },
    ],
  },
]

const categories = ['Other', 'Study', 'College', 'Development', 'Personal', 'Work']

const emptyTask: {
  title: string
  description: string
  category: string
  priority: 'low' | 'medium' | 'high'
  status: 'not_started' | 'in_progress' | 'completed'
  due_date: string
  estimated_duration: string
  scheduled_start: string
  scheduled_end: string
} = {
  title: '',
  description: '',
  category: 'Other',
  priority: 'medium',
  status: 'not_started',
  due_date: '',
  estimated_duration: '',
  scheduled_start: '',
  scheduled_end: '',
}

function isoDate(value: string) {
  return value ? value.slice(0, 10) : ''
}

function localIsoDate(value = new Date()) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(value: string) {
  if (!value) return 'No due date'
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })
}

function formatTime(value: string) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatDuration(minutes: number) {
  if (!minutes) return '0m'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ''}` : `${remainder}m`
}

function activityDuration(activity: Activity) {
  const milliseconds =
    new Date(activity.end_time).getTime() - new Date(activity.start_time).getTime()
  return formatDuration(Math.max(0, Math.round(milliseconds / 60000)))
}

function App() {
  const [activePage, setActivePage] = useState<Page>('Overview')
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(getSavedTheme)
  const [themeStorageError, setThemeStorageError] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [dueReminders, setDueReminders] = useState<Reminder[]>([])
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [selectedDate, setSelectedDate] = useState(localIsoDate)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [taskFilter, setTaskFilter] = useState<'all' | 'today' | 'upcoming' | 'completed' | 'overdue'>('all')
  const [taskForm, setTaskForm] = useState(emptyTask)
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [activityForm, setActivityForm] = useState({
    title: '',
    notes: '',
    category: 'Other',
    start_time: '',
    end_time: '',
    task_id: '',
  })
  const [editingActivityId, setEditingActivityId] = useState<number | null>(null)

  async function loadData(date = selectedDate) {
    setLoading(true)
    setError('')
    try {
      const [tasksResponse, activitiesResponse, dashboardResponse] = await Promise.all([
        fetch(`${API_URL}/tasks`),
        fetch(`${API_URL}/activities?date=${date}`),
        fetch(`${API_URL}/dashboard?date=${date}`),
      ])
      if (!tasksResponse.ok || !activitiesResponse.ok || !dashboardResponse.ok) {
        throw new Error('Could not load Chronicle data')
      }
      const [taskData, activityData, dashboardData] = await Promise.all([
        tasksResponse.json(),
        activitiesResponse.json(),
        dashboardResponse.json(),
      ])
      setTasks(taskData)
      setActivities(activityData)
      setDashboard(dashboardData)
    } catch (loadError) {
      console.error(loadError)
      setError('Unable to load your Chronicle data. Check that the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function loadInitialData() {
      setLoading(true)
      setError('')
      try {
        const today = localIsoDate()
        const [tasksResponse, activitiesResponse, dashboardResponse] = await Promise.all([
          fetch(`${API_URL}/tasks`),
          fetch(`${API_URL}/activities?date=${today}`),
          fetch(`${API_URL}/dashboard?date=${today}`),
        ])
        if (!tasksResponse.ok || !activitiesResponse.ok || !dashboardResponse.ok) {
          throw new Error('Could not load Chronicle data')
        }
        const [taskData, activityData, dashboardData] = await Promise.all([
          tasksResponse.json(),
          activitiesResponse.json(),
          dashboardResponse.json(),
        ])
        setTasks(taskData)
        setActivities(activityData)
        setDashboard(dashboardData)
      } catch (loadError) {
        console.error(loadError)
        setError('Unable to load your Chronicle data. Check that the backend is running.')
      } finally {
        setLoading(false)
      }
    }
    loadInitialData()
  }, [])

  useEffect(() => {
    let active = true
    async function checkDueReminders() {
      try {
        const due = await apiRequest<Reminder[]>(API_URL, '/reminders/due')
        for (const reminder of due) {
          const result = await apiRequest<{ notified: boolean; reminder?: Reminder }>(
            API_URL,
            `/reminders/${reminder.id}/notify`,
            { method: 'POST' },
          )
          const notifiedReminder = result.reminder
          if (!active || !result.notified || !notifiedReminder) continue
          setDueReminders((current) =>
            current.some((item) => item.id === notifiedReminder.id)
              ? current
              : [...current, notifiedReminder],
          )
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification('Chronicle reminder', { body: reminder.title })
            } catch (notificationError) {
              console.error('Could not show the browser notification.', notificationError)
            }
          }
        }
      } catch (reminderError) {
        console.error('Could not check due reminders.', reminderError)
      }
    }

    void checkDueReminders()
    const interval = window.setInterval(() => void checkDueReminders(), 30_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  function selectTheme(nextTheme: Theme) {
    setTheme(nextTheme)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
      setThemeStorageError(false)
    } catch (error) {
      console.error('Could not save the theme preference.', error)
      setThemeStorageError(true)
    }
  }

  async function dismissReminderFromBanner(reminderId: number) {
    setError('')
    try {
      await apiRequest<{ message: string }>(
        API_URL,
        `/reminders/${reminderId}/dismiss`,
        { method: 'POST' },
      )
      setDueReminders((current) => current.filter((reminder) => reminder.id !== reminderId))
    } catch (dismissError) {
      console.error(dismissError)
      setError(dismissError instanceof Error ? dismissError.message : 'Could not dismiss the reminder.')
    }
  }

  useEffect(() => {
    if (!navigationOpen) return

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setNavigationOpen(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [navigationOpen])

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const payload = {
      title: taskForm.title,
      description: taskForm.description,
      category: taskForm.category,
      priority: taskForm.priority,
      status: taskForm.status,
      due_date: taskForm.due_date || null,
      estimated_duration: taskForm.estimated_duration ? Number(taskForm.estimated_duration) : null,
      scheduled_start: taskForm.scheduled_start || null,
      scheduled_end: taskForm.scheduled_end || null,
    }
    try {
      const response = await fetch(
        editingTaskId ? `${API_URL}/tasks/${editingTaskId}` : `${API_URL}/tasks`,
        {
          method: editingTaskId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      if (!response.ok) throw new Error('Could not save task')
      setTaskForm(emptyTask)
      setEditingTaskId(null)
      await loadData()
    } catch (saveError) {
      console.error(saveError)
      setError('Could not save the task. Please try again.')
    }
  }

  function editTask(task: Task) {
    setEditingTaskId(task.id)
    setTaskForm({
      title: task.title,
      description: task.description || '',
      category: task.category,
      priority: task.priority || 'medium',
      status: task.status || 'not_started',
      due_date: isoDate(task.due_date || ''),
      estimated_duration: task.estimated_duration?.toString() || '',
      scheduled_start: task.scheduled_start?.slice(0, 16) || '',
      scheduled_end: task.scheduled_end?.slice(0, 16) || '',
    })
  }

  async function toggleTask(task: Task) {
    const completed = task.status !== 'completed'
    try {
      const response = await fetch(`${API_URL}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: completed ? 'completed' : 'not_started',
          is_completed: completed,
        }),
      })
      if (!response.ok) throw new Error('Could not update task')
      await loadData()
    } catch (updateError) {
      console.error(updateError)
      setError('Could not update the task.')
    }
  }

  async function deleteTask(task: Task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return
    try {
      const response = await fetch(`${API_URL}/tasks/${task.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not delete task')
      await loadData()
    } catch (deleteError) {
      console.error(deleteError)
      setError('Could not delete the task.')
    }
  }

  async function saveActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!activityForm.start_time || !activityForm.end_time) {
      setError('Choose both a start and end time.')
      return
    }
    if (activityForm.end_time <= activityForm.start_time) {
      setError('End time must be later than start time.')
      return
    }
    const payload = {
      title: activityForm.title,
      notes: activityForm.notes,
      category: activityForm.category,
      start_time: activityForm.start_time,
      end_time: activityForm.end_time,
      task_id: activityForm.task_id ? Number(activityForm.task_id) : null,
    }
    try {
      const response = await fetch(
        editingActivityId ? `${API_URL}/activities/${editingActivityId}` : `${API_URL}/activities`,
        {
          method: editingActivityId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      if (!response.ok) throw new Error('Could not save activity')
      setActivityForm({
        title: '',
        notes: '',
        category: 'Other',
        start_time: '',
        end_time: '',
        task_id: '',
      })
      setEditingActivityId(null)
      await loadData(selectedDate)
    } catch (saveError) {
      console.error(saveError)
      setError('Could not save the schedule block.')
    }
  }

  function editActivity(activity: Activity) {
    setEditingActivityId(activity.id)
    setActivityForm({
      title: activity.title,
      notes: activity.notes || '',
      category: activity.category,
      start_time: activity.start_time.slice(0, 16),
      end_time: activity.end_time.slice(0, 16),
      task_id: activity.task_id?.toString() || '',
    })
  }

  async function deleteActivity(activity: Activity) {
    if (!window.confirm(`Delete "${activity.title}" from your schedule?`)) return
    try {
      const response = await fetch(`${API_URL}/activities/${activity.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not delete activity')
      await loadData(selectedDate)
    } catch (deleteError) {
      console.error(deleteError)
      setError('Could not delete the schedule block.')
    }
  }

  async function changeDate(date: string) {
    if (!date) return
    setSelectedDate(date)
    await loadData(date)
  }

  const today = new Date(selectedDate + 'T12:00:00')
  const formattedDate = today.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const todayIso = localIsoDate()
  const isToday = selectedDate === todayIso

  const filteredTasks = tasks.filter((task) => {
    const dueDate = isoDate(task.due_date || '')
    if (taskFilter === 'today') return dueDate === todayIso
    if (taskFilter === 'upcoming') return dueDate > todayIso && task.status !== 'completed'
    if (taskFilter === 'completed') return task.status === 'completed'
    if (taskFilter === 'overdue') {
      return dueDate && dueDate < todayIso && task.status !== 'completed'
    }
    return true
  })
  const overviewTasks = dashboard
    ? [...dashboard.overdue, ...dashboard.due_today.filter(
        (task) => !dashboard.overdue.some((overdueTask) => overdueTask.id === task.id),
      )]
    : []
  const greeting = new Date().getHours() < 12
    ? 'Good morning'
    : new Date().getHours() < 18
      ? 'Good afternoon'
      : 'Good evening'
  return (
    <div className="app-shell">
      {navigationOpen && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setNavigationOpen(false)}
        />
      )}
      <aside id="primary-navigation" className={`sidebar ${navigationOpen ? 'is-open' : ''}`}>
        <button
          className="brand"
          onClick={() => {
            setActivePage('Overview')
            setNavigationOpen(false)
          }}
        >
          <span className="brand-mark">C</span>
          <span>chronicle</span>
        </button>

        <nav className="navigation" aria-label="Primary navigation">
          {navigationGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="sidebar-label">{group.label}</p>
              {group.items.map(({ page, index }) => (
                <button
                  key={page}
                  className={`nav-item ${activePage === page ? 'active' : ''}`}
                  aria-current={activePage === page ? 'page' : undefined}
                  onClick={() => {
                    setActivePage(page)
                    setNavigationOpen(false)
                  }}
                >
                  <span className="nav-icon">{index}</span>
                  <span className="nav-name">{page}</span>
                </button>
              ))}
            </div>
          ))}
          <div className="nav-group nav-settings-group">
            <p className="sidebar-label">Personal</p>
            <button
              className={`nav-item ${activePage === 'Settings' ? 'active' : ''}`}
              aria-current={activePage === 'Settings' ? 'page' : undefined}
              onClick={() => {
                setActivePage('Settings')
                setNavigationOpen(false)
              }}
            >
              <span className="nav-icon">08</span>
              <span className="nav-name">Settings</span>
            </button>
          </div>
        </nav>

        <div className="sidebar-note">
          <span className="status-dot live" />
          <div>
            <strong>Local workspace</strong>
            <small>Changes saved locally</small>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-leading">
            <button
              className="menu-toggle"
              aria-label={navigationOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-controls="primary-navigation"
              aria-expanded={navigationOpen}
              onClick={() => setNavigationOpen(!navigationOpen)}
            >
              <span />
              <span />
            </button>
            <div className="breadcrumb">
              Chronicle <span>/</span> {activePage}
            </div>
          </div>
          <div className="topbar-right">
            <span className="date-label">{formattedDate}</span>
            <div className="avatar" role="img" aria-label="Personal workspace">S</div>
          </div>
        </header>

        {error && <div className="error-banner" role="alert">{error}</div>}
        {dueReminders.map((reminder) => (
          <div className="reminder-alert" role="alert" key={reminder.id}>
            <div>
              <span className="eyebrow">REMINDER</span>
              <strong>{reminder.title}</strong>
            </div>
            <button
              className="inline-button"
              type="button"
              onClick={() => void dismissReminderFromBanner(reminder.id)}
            >
              Dismiss
            </button>
          </div>
        ))}

        {activePage === 'Overview' && (
          <>
            <section className="welcome-section overview-hero">
              <div>
                <p className="eyebrow">{isToday ? 'A NOTE TO YOURSELF · TODAY' : 'A NOTE TO YOURSELF · DAY REVIEW'}</p>
                <h1>{isToday ? greeting : 'A day in perspective'}<span>.</span></h1>
                <p className="welcome-subtitle">
                  {dashboard
                    ? `${dashboard.task_summary.total} commitments · ${dashboard.activities.length} planned blocks`
                    : 'Gathering your day…'}
                </p>
              </div>
              <button className="primary-button" onClick={() => setActivePage('Tasks')}>
                <span aria-hidden="true">＋</span> Add a task
              </button>
            </section>

            {loading ? (
              <p className="loading-state">Gathering your day…</p>
            ) : dashboard ? (
              <>
                <section className="stats-grid overview-metrics" aria-label="Daily overview">
                  <article className="stat-card">
                    <span className="stat-label">TO DO</span>
                    <strong>{dashboard.task_summary.total - dashboard.task_summary.completed}</strong>
                    <span className="stat-note">{dashboard.task_summary.completed} of {dashboard.task_summary.total} complete</span>
                  </article>
                  <article className="stat-card">
                    <span className="stat-label">DUE TODAY</span>
                    <strong className={dashboard.task_summary.due_today ? 'metric-today' : ''}>{dashboard.task_summary.due_today}</strong>
                    <span className="stat-note">Tasks with today's date</span>
                  </article>
                  <article className="stat-card">
                    <span className="stat-label">COMING UP</span>
                    <strong>{dashboard.task_summary.upcoming}</strong>
                    <span className="stat-note">Tasks with a future due date</span>
                  </article>
                  <article className="stat-card">
                    <span className="stat-label">PLANNED TIME</span>
                    <strong>{formatDuration(dashboard.planned_minutes)}</strong>
                    <span className="stat-note">{dashboard.activities.length} blocks in your day</span>
                  </article>
                </section>

                <div className="dashboard-grid overview-grid">
                  <section className="overview-section overview-tasks">
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">YOUR PLAN</p>
                        <h2>Today’s focus</h2>
                      </div>
                      <button className="inline-button" onClick={() => setActivePage('Tasks')}>All tasks <span aria-hidden="true">↗</span></button>
                    </div>
                    <div className="task-list overview-task-list">
                      {dashboard.overdue.length > 0 && (
                        <>
                          <p className="task-group-label overdue-label">Past due <span>{dashboard.overdue.length}</span></p>
                          {dashboard.overdue.map((task) => (
                            <TaskRow key={task.id} task={task} onToggle={toggleTask} onEdit={editTask} onDelete={deleteTask} overview />
                          ))}
                        </>
                      )}
                      {dashboard.due_today.length > 0 && (
                        <>
                          <p className="task-group-label">Due today <span>{dashboard.due_today.length}</span></p>
                          {dashboard.due_today.map((task) => (
                            <TaskRow key={task.id} task={task} onToggle={toggleTask} onEdit={editTask} onDelete={deleteTask} overview />
                          ))}
                        </>
                      )}
                      {overviewTasks.length === 0 && (
                        <EmptyState
                          title="Nothing pressing today"
                          detail={tasks.length
                            ? `Your task list has ${tasks.length} ${tasks.length === 1 ? 'item' : 'items'}; none are due today.`
                            : 'Your task list is clear. Add a commitment when you are ready.'}
                          action={tasks.length ? 'Browse tasks' : 'Add a task'}
                          onAction={() => setActivePage('Tasks')}
                        />
                      )}
                    </div>
                  </section>

                  <section className="overview-section overview-schedule">
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">HOW THE DAY IS SHAPED</p>
                        <h2>{isToday ? 'Your schedule' : 'The schedule'}</h2>
                      </div>
                      <button className="inline-button" onClick={() => setActivePage('Schedule')}>View day <span aria-hidden="true">↗</span></button>
                    </div>
                    <div className="schedule-list overview-schedule-list">
                      {dashboard.activities.length ? dashboard.activities.map((activity) => (
                        <div className="schedule-row overview-schedule-row" key={activity.id}>
                          <time>
                            <strong>{formatTime(activity.start_time)}</strong>
                            <span>{formatTime(activity.end_time)}</span>
                          </time>
                          <span className="schedule-marker" aria-hidden="true" />
                          <div className="schedule-details">
                            <strong>{activity.title}</strong>
                            <span>{activity.category} · {activityDuration(activity)}</span>
                          </div>
                        </div>
                      )) : (
                        <EmptyState
                          title="Space in the day"
                          detail="There are no schedule blocks saved for this date."
                          action="Create a block"
                          onAction={() => setActivePage('Schedule')}
                        />
                      )}
                    </div>
                  </section>
                </div>

                {dashboard.overdue.length > 0 && (
                  <section className="attention-panel">
                    <div>
                      <p className="eyebrow">NEEDS ATTENTION</p>
                      <h2>{dashboard.overdue.length} overdue {dashboard.overdue.length === 1 ? 'task' : 'tasks'}</h2>
                    </div>
                    <button className="inline-button" onClick={() => { setTaskFilter('overdue'); setActivePage('Tasks') }}>
                      Review overdue tasks
                    </button>
                  </section>
                )}
              </>
            ) : null}
          </>
        )}

        {activePage === 'Tasks' && (
          <section className="page-section">
            <header className="page-heading">
              <div>
                <p className="eyebrow">WORKSPACE / TASK MANAGEMENT</p>
                <h1>Tasks<span>.</span></h1>
              </div>
            </header>

            <div className="tasks-layout">
              <section className="panel task-editor">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">{editingTaskId ? 'UPDATE COMMITMENT' : 'NEW COMMITMENT'}</p>
                    <h2>{editingTaskId ? 'Edit task' : 'Add a task'}</h2>
                  </div>
                </div>
                <form className="task-form" onSubmit={saveTask}>
                  <label className="full-field">
                    Title
                    <input required value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} placeholder="What needs doing?" />
                  </label>
                  <label className="full-field">
                    Description
                    <textarea value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} placeholder="Notes, context or a next step" />
                  </label>
                  <label>
                    Category
                    <select value={taskForm.category} onChange={(event) => setTaskForm({ ...taskForm, category: event.target.value })}>
                      {categories.map((category) => <option key={category}>{category}</option>)}
                    </select>
                  </label>
                  <label>
                    Priority
                    <select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value as typeof taskForm.priority })}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <label>
                    Status
                    <select value={taskForm.status} onChange={(event) => setTaskForm({ ...taskForm, status: event.target.value as typeof taskForm.status })}>
                      <option value="not_started">Not started</option>
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>
                  <label>
                    Due date
                    <input type="date" value={taskForm.due_date} onChange={(event) => setTaskForm({ ...taskForm, due_date: event.target.value })} />
                  </label>
                  <label>
                    Estimated duration
                    <input type="number" min="1" value={taskForm.estimated_duration} onChange={(event) => setTaskForm({ ...taskForm, estimated_duration: event.target.value })} placeholder="Minutes" />
                  </label>
                  <label>
                    Scheduled start
                    <input type="datetime-local" value={taskForm.scheduled_start} onChange={(event) => setTaskForm({ ...taskForm, scheduled_start: event.target.value })} />
                  </label>
                  <label>
                    Scheduled end
                    <input type="datetime-local" value={taskForm.scheduled_end} onChange={(event) => setTaskForm({ ...taskForm, scheduled_end: event.target.value })} />
                  </label>
                  <div className="form-actions">
                    <button className="primary-button" type="submit">{editingTaskId ? 'Save changes' : 'Add task'}</button>
                    {editingTaskId && <button type="button" className="secondary-button" onClick={() => { setEditingTaskId(null); setTaskForm(emptyTask) }}>Cancel</button>}
                  </div>
                </form>
              </section>

              <section className="panel task-inbox">
                <div className="panel-heading task-inbox-heading">
                  <div>
                    <p className="eyebrow">YOUR COMMITMENTS</p>
                    <h2>{filteredTasks.length} tasks</h2>
                  </div>
                  <div className="filter-row">
                    {(['all', 'today', 'upcoming', 'completed', 'overdue'] as const).map((filter) => (
                      <button
                        key={filter}
                        className={taskFilter === filter ? 'active' : ''}
                        aria-pressed={taskFilter === filter}
                        onClick={() => setTaskFilter(filter)}
                      >
                        {filter[0].toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="task-list">
                  {loading ? <p className="loading-state">Loading tasks…</p> : filteredTasks.length ? filteredTasks.map((task) => (
                    <TaskRow key={task.id} task={task} onToggle={toggleTask} onEdit={editTask} onDelete={deleteTask} expanded />
                  )) : (
                    <EmptyState title="No tasks in this view" detail="Choose another filter or add a new commitment." />
                  )}
                </div>
              </section>
            </div>
          </section>
        )}

        {activePage === 'Schedule' && (
          <section className="page-section">
            <header className="page-heading schedule-heading">
              <div>
                <p className="eyebrow">WORKSPACE / DAILY SCHEDULE</p>
                <h1>Schedule<span>.</span></h1>
              </div>
              <label className="date-picker">
                Day
                <input type="date" value={selectedDate} onChange={(event) => changeDate(event.target.value)} />
              </label>
            </header>

            <div className="schedule-layout">
              <section className="panel schedule-editor">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">{editingActivityId ? 'RESCHEDULE BLOCK' : 'NEW TIME BLOCK'}</p>
                    <h2>{editingActivityId ? 'Edit block' : 'Add to the day'}</h2>
                  </div>
                </div>
                <form className="task-form" onSubmit={saveActivity}>
                  <label className="full-field">
                    Title
                    <input required value={activityForm.title} onChange={(event) => setActivityForm({ ...activityForm, title: event.target.value })} placeholder="Focus block or commitment" />
                  </label>
                  <label className="full-field">
                    Notes
                    <textarea value={activityForm.notes} onChange={(event) => setActivityForm({ ...activityForm, notes: event.target.value })} placeholder="Optional context" />
                  </label>
                  <label>
                    Category
                    <select value={activityForm.category} onChange={(event) => setActivityForm({ ...activityForm, category: event.target.value })}>
                      {categories.map((category) => <option key={category}>{category}</option>)}
                    </select>
                  </label>
                  <label>
                    Linked task
                    <select value={activityForm.task_id} onChange={(event) => setActivityForm({ ...activityForm, task_id: event.target.value })}>
                      <option value="">No linked task</option>
                      {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                    </select>
                  </label>
                  <label>
                    Start
                    <input type="datetime-local" required value={activityForm.start_time} onChange={(event) => setActivityForm({ ...activityForm, start_time: event.target.value })} />
                  </label>
                  <label>
                    End
                    <input type="datetime-local" required value={activityForm.end_time} onChange={(event) => setActivityForm({ ...activityForm, end_time: event.target.value })} />
                  </label>
                  <div className="form-actions">
                    <button className="primary-button" type="submit">{editingActivityId ? 'Save block' : 'Add block'}</button>
                    {editingActivityId && <button type="button" className="secondary-button" onClick={() => { setEditingActivityId(null); setActivityForm({ title: '', notes: '', category: 'Other', start_time: '', end_time: '', task_id: '' }) }}>Cancel</button>}
                  </div>
                </form>
              </section>

              <section className="panel day-timeline">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">{formattedDate}</p>
                    <h2>{activities.length} schedule blocks</h2>
                  </div>
                  <span className="panel-count">{formatDuration(dashboard?.planned_minutes || 0)} planned</span>
                </div>
                {loading ? <p className="loading-state">Loading schedule…</p> : activities.length ? (
                  <div className="full-timeline">
                    {activities.map((activity) => (
                      <article className="timeline-card" key={activity.id}>
                        <time>
                          <strong>{formatTime(activity.start_time)}</strong>
                          <span>{formatTime(activity.end_time)}</span>
                        </time>
                        <div className="timeline-card-line" />
                        <div className="timeline-card-content">
                          <div>
                            <span className="category-tag">{activity.category}</span>
                            <h3>{activity.title}</h3>
                          </div>
                          {activity.notes && <p>{activity.notes}</p>}
                          <span className="duration">{activityDuration(activity)}</span>
                        </div>
                        <div className="timeline-actions">
                          <button className="inline-button" onClick={() => editActivity(activity)}>Edit</button>
                          <button className="inline-button danger" onClick={() => deleteActivity(activity)}>Delete</button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No blocks on this day" detail="Add a time block to start building this day’s schedule." />
                )}
              </section>
            </div>
          </section>
        )}

        {activePage === 'Reminders' && (
          <RemindersPage
            apiUrl={API_URL}
            tasks={tasks}
            onReminderDismissed={(id) => setDueReminders((current) => current.filter((item) => item.id !== id))}
          />
        )}

        {activePage === 'Time' && (
          <TimeTrackingPage apiUrl={API_URL} tasks={tasks} activities={activities} />
        )}

        {activePage === 'Journal' && <JournalPage apiUrl={API_URL} />}

        {activePage === 'Insights' && <InsightsPage apiUrl={API_URL} />}

        {activePage === 'Settings' && (
          <section className="settings-page">
            <header className="page-heading settings-heading">
              <div>
                <p className="eyebrow">PERSONAL / APPEARANCE</p>
                <h1>Settings<span>.</span></h1>
                <p className="welcome-subtitle">A small way to make Chronicle feel like yours.</p>
              </div>
            </header>
            <section className="settings-section" aria-labelledby="appearance-heading">
              <div className="settings-copy">
                <p className="eyebrow">APPEARANCE</p>
                <h2 id="appearance-heading">Theme</h2>
                <p>Choose the light or dark palette. Your choice is saved in this browser.</p>
              </div>
              <fieldset className="theme-selector">
                <legend className="visually-hidden">Choose a theme</legend>
                <div className="theme-options">
                  {([
                    ['light', 'Light', 'Warm paper'],
                    ['dark', 'Dark', 'Green charcoal'],
                  ] as const).map(([value, label, detail]) => (
                    <label className={`theme-option ${theme === value ? 'selected' : ''}`} key={value}>
                      <input
                        type="radio"
                        name="theme"
                        value={value}
                        checked={theme === value}
                        onChange={() => selectTheme(value)}
                      />
                      <span className={`theme-preview ${value}`} aria-hidden="true">
                        <span className="theme-preview-rail" />
                        <span className="theme-preview-content">
                          <i />
                          <i />
                        </span>
                      </span>
                      <span className="theme-option-copy">
                        <strong>{label}</strong>
                        <small>{detail}</small>
                      </span>
                      {theme === value && <span className="theme-current">Selected</span>}
                    </label>
                  ))}
                </div>
              </fieldset>
              {themeStorageError && (
                <p className="theme-storage-error" role="alert">
                  Chronicle could not save this preference in your browser. The selection will apply until you leave this page.
                </p>
              )}
            </section>
          </section>
        )}

      </main>
    </div>
  )
}

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
  expanded = false,
  overview = false,
}: {
  task: Task
  onToggle: (task: Task) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  expanded?: boolean
  overview?: boolean
}) {
  const completed = task.status === 'completed' || Boolean(task.is_completed)
  return (
    <div className={`task-row ${completed ? 'task-done' : ''} ${overview ? 'overview-task-row' : ''}`}>
      <button
        className={`task-check ${completed ? 'checked' : ''}`}
        onClick={() => onToggle(task)}
        aria-label={completed ? 'Mark task incomplete' : 'Mark task complete'}
      >
        {completed ? '✓' : ''}
      </button>
      <div className="task-info">
        <strong>{task.title}</strong>
        {expanded ? (
          <span>{task.description || 'No description'}</span>
        ) : (
          <span>{task.category} · {formatDate(task.due_date || '')}</span>
        )}
      </div>
      {expanded && (
        <>
          <span className={`status-tag status-${task.status || 'not_started'}`}>
            {(task.status || 'not_started').replace('_', ' ')}
          </span>
          <span className={`priority-tag priority-${task.priority || 'medium'}`}>{task.priority || 'medium'}</span>
          <span className="category-tag">{task.category}</span>
          {task.estimated_duration && <span className="duration">{formatDuration(task.estimated_duration)}</span>}
        </>
      )}
      {overview && (
        <div className="overview-task-meta">
          <span className={`priority-mark priority-${task.priority || 'medium'}`} title={`${task.priority || 'medium'} priority`}>
            {task.priority || 'medium'}
          </span>
          <span className={`due-date ${task.due_date && task.due_date.slice(0, 10) < localIsoDate() && !completed ? 'overdue' : ''}`}>
            {formatDate(task.due_date || '')}
          </span>
        </div>
      )}
      {expanded && (
        <div className="task-actions">
          <button className="inline-button" onClick={() => onEdit(task)}>Edit</button>
          <button className="inline-button danger" onClick={() => onDelete(task)}>Delete</button>
        </div>
      )}
    </div>
  )
}

function EmptyState({
  title,
  detail,
  action,
  onAction,
}: {
  title: string
  detail: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="empty-state">
      <span className="empty-mark">○</span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      {action && onAction && <button className="inline-button" onClick={onAction}>{action}</button>}
    </div>
  )
}

export default App
