import { useEffect, useState, type FormEvent, } from 'react'
import './App.css'

const API_URL = 'http://127.0.0.1:8000'

type Task = {
  id: number
  title: string
  category: string
  scheduled_start: string | null
  scheduled_end: string | null
  is_completed: boolean | number
  created_at?: string
}

function formatTaskTime(task: Task) {
  const format = (value: string | null) => {
    if (!value) return '—'

    return new Date(value).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  if (!task.scheduled_start && !task.scheduled_end) {
    return 'Time not scheduled'
  }

  return `${format(task.scheduled_start)} – ${format(task.scheduled_end)}`
}

const timeline = [
  { time: '06:30', title: 'Wake up', detail: 'Morning routine', type: 'personal' },
  { time: '07:00', title: 'Java fundamentals', detail: 'Planned study session · 1h 30m', type: 'study' },
  { time: '08:30', title: 'Break', detail: 'Unscheduled / personal time', type: 'break' },
  { time: '09:00', title: 'Project development', detail: 'Planned development session · 2h', type: 'work' },
]

function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activePage, setActivePage] = useState('Overview')
  const [isTracking, setIsTracking] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState('Other')
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [taskError, setTaskError] = useState('')
  const [taskSuccess, setTaskSuccess] = useState('')
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editCategory, setEditCategory] = useState('Other')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [taskActionError, setTaskActionError] = useState('')

  useEffect(() => {
    async function loadTasks() {
      try {
        const response = await fetch(`${API_URL}/tasks`)

        if (!response.ok) {
          throw new Error('Could not fetch tasks')
        }

        const data: Task[] = await response.json()
        setTasks(data)
      } catch (error) {
        console.error(error)
        setLoadError('Unable to load tasks. Check whether the backend is running.')
      } finally {
        setIsLoading(false)
      }
    }

    loadTasks()
  }, [])

  const today = new Date()
  const formattedDate = today.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const completedTasks = tasks.filter(
    (task) => Boolean(task.is_completed),
  ).length

  async function toggleTask(id: number) {
    const task = tasks.find((task) => task.id === id)

    if (!task) return

    const newStatus = !Boolean(task.is_completed)

    try {
      const response = await fetch(`${API_URL}/tasks/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          is_completed: newStatus,
        }),
      })

      if (!response.ok) {
        throw new Error('Could not update task')
      }

      const updatedTask: Task = await response.json()

      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.id === id ? updatedTask : task,
        ),
      )
    } catch (error) {
      console.error(error)
      setLoadError('Could not update task. Please try again.')
    }
  }

  async function createTask(event: { preventDefault: () => void }) {
    event.preventDefault()

    setIsSubmitting(true)
    setTaskError('')
    setTaskSuccess('')

    if (newStart && newEnd && newEnd < newStart) {
      setTaskError('End time cannot be earlier than start time.')
      setIsSubmitting(false)
      return
    }

    try {
      const response = await fetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newTitle,
          category: newCategory,
          scheduled_start: newStart || null,
          scheduled_end: newEnd || null,
        }),
      })

      if (!response.ok) {
        throw new Error('Could not create task')
      }

      const createdTask: Task = await response.json()

      setTasks((currentTasks) => [createdTask, ...currentTasks])

      setNewTitle('')
      setNewCategory('Other')
      setNewStart('')
      setNewEnd('')

      setTaskSuccess('Task added successfully!')
    } catch (error) {
      console.error(error)
      setTaskError('Unable to save task. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function startEditing(task: Task) {
    setEditingTaskId(task.id)
    setEditTitle(task.title)
    setEditCategory(task.category)
    setEditStart(task.scheduled_start?.slice(0, 16) ?? '')
    setEditEnd(task.scheduled_end?.slice(0, 16) ?? '')
    setTaskActionError('')
  }

  async function saveTask(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault()
    setTaskActionError('')

    if (editStart && editEnd && editEnd < editStart) {
      setTaskActionError('End time cannot be earlier than start time.')
      return
    }

    try {
      const response = await fetch(`${API_URL}/tasks/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: editTitle,
          category: editCategory,
          scheduled_start: editStart || null,
          scheduled_end: editEnd || null,
        }),
      })

      if (!response.ok) {
        throw new Error('Could not update task')
      }

      const updatedTask: Task = await response.json()

      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.id === id ? updatedTask : task,
        ),
      )

      setEditingTaskId(null)
    } catch (error) {
      console.error(error)
      setTaskActionError('Could not save changes. Please try again.')
    }
  }

  async function deleteTask(id: number) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this task? This cannot be undone.',
    )

    if (!confirmed) return

    setTaskActionError('')

    try {
      const response = await fetch(`${API_URL}/tasks/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Could not delete task')
      }

      setTasks((currentTasks) =>
        currentTasks.filter((task) => task.id !== id),
      )

      if (editingTaskId === id) {
        setEditingTaskId(null)
      }
    } catch (error) {
      console.error(error)
      setTaskActionError('Could not delete task. Please try again.')
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <span>chronicle</span>
        </div>

        <div className="sidebar-label">WORKSPACE</div>

        <nav className="navigation">
          {[
            { name: 'Overview', icon: '◫' },
            { name: 'Timeline', icon: '◷' },
            { name: 'Calendar', icon: '▦' },
            { name: 'Tasks', icon: '☑' },
            { name: 'Journal', icon: '▤' },
            { name: 'Reports', icon: '▥' },
          ].map((item) => (
            <button
              key={item.name}
              className={`nav-item ${activePage === item.name ? 'active' : ''}`}
              onClick={() => setActivePage(item.name)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="tracking-indicator">
            <span className={`status-dot ${isTracking ? 'live' : ''}`} />
            <div>
              <strong>{isTracking ? 'Tracking active' : 'Tracking paused'}</strong>
              <small>{isTracking ? 'Session in progress' : 'No active session'}</small>
            </div>
          </div>
          <button
            className="settings-button"
            onClick={() => setActivePage('Settings')}
          >
            ⚙ &nbsp; Settings
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> {activePage}</div>
          <div className="topbar-right">
            <span className="date-label">{formattedDate}</span>
            <div className="avatar">S</div>
          </div>
        </header>

        {activePage === 'Overview' ? (
          <>
            <section className="welcome-section">
              <div>
                <p className="eyebrow">YOUR DAY, IN PERSPECTIVE</p>
                <h1>Today's overview<span>.</span></h1>
                <p className="welcome-subtitle">
                  A clear record of what was planned and what actually happened.
                </p>
              </div>
              <button
                className={`tracking-button ${isTracking ? 'tracking' : ''}`}
                onClick={() => setIsTracking(!isTracking)}
              >
                <span>{isTracking ? 'Ⅱ' : '▶'}</span>
                {isTracking ? 'Pause session' : 'Start a session'}
              </button>
            </section>

            <section className="stats-grid">
              <article className="stat-card">
                <span className="stat-label">PLANNED TASKS</span>
                <strong>{tasks.length.toString().padStart(2, '0')}</strong>
                <span className="stat-note">Scheduled for today</span>
              </article>
              <article className="stat-card">
                <span className="stat-label">COMPLETED</span>
                <strong>{completedTasks.toString().padStart(2, '0')}<small> / {tasks.length}</small></strong>
                <span className="stat-note">Tasks marked complete</span>
              </article>
              <article className="stat-card">
                <span className="stat-label">RECORDED TIME</span>
                <strong>—</strong>
                <span className="stat-note">No activity data yet</span>
              </article>
              <article className="stat-card">
                <span className="stat-label">NEXT COMMITMENT</span>
                <strong className="next-time">07:00</strong>
                <span className="stat-note">Java fundamentals</span>
              </article>
            </section>

            <div className="dashboard-grid">
              <section className="panel tasks-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">YOUR PLAN</p>
                    <h2>Today's tasks</h2>
                  </div>
                  <span className="panel-count">{completedTasks}/{tasks.length} done</span>
                </div>


                <div className="task-list">
                  {isLoading ? (
                    <p>Loading your tasks...</p>
                  ) : loadError ? (
                    <p>{loadError}</p>
                  ) : tasks.length === 0 ? (
                    <p>No tasks saved yet.</p>
                  ) : (
                    tasks.map((task) => (
                      <div
                        className={`task-row ${Boolean(task.is_completed) ? 'task-done' : ''}`}
                        key={task.id}
                      >
                        <button
                          className={`task-check ${Boolean(task.is_completed) ? 'checked' : ''}`}
                          onClick={() => toggleTask(task.id)}
                          aria-label={
                            Boolean(task.is_completed)
                              ? 'Mark task incomplete'
                              : 'Mark task complete'
                          }
                        >
                          {Boolean(task.is_completed) ? '✓' : ''}
                        </button>

                        <div className="task-info">
                          <strong>{task.title}</strong>
                          <span>{formatTaskTime(task)}</span>
                        </div>

                        <span className="category-tag">{task.category}</span>
                      </div>
                    ))
                  )}
                </div>

                <button className="text-button" onClick={() => setActivePage('Tasks')}>
                  View all tasks <span>↗</span>
                </button>
              </section>

              <section className="panel timeline-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">THE RECORD</p>
                    <h2>Activity timeline</h2>
                  </div>
                  <span className="live-label">
                    <span className="status-dot" /> SAMPLE
                  </span>
                </div>

                <div className="timeline-list">
                  {timeline.map((entry) => (
                    <div className="timeline-entry" key={entry.time}>
                      <span className="timeline-time">{entry.time}</span>
                      <span className={`timeline-marker ${entry.type}`} />
                      <div className="timeline-info">
                        <strong>{entry.title}</strong>
                        <span>{entry.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="timeline-footnote">
                  Sample entries — automatic tracking is not connected yet.
                </p>
              </section>
            </div>

            <section className="bottom-note">
              <span className="note-icon">↗</span>
              <div>
                <strong>Upcoming commitments</strong>
                <p>Your calendar and deadline reminders will appear here.</p>
              </div>
              <button onClick={() => setActivePage('Calendar')}>Open calendar →</button>
            </section>
          </>
        ) : activePage === 'Tasks' ? (
          <section className="placeholder-page">
            <p className="eyebrow">WORKSPACE / TASK MANAGEMENT</p>
            <h1>Tasks<span>.</span></h1>
            <p>Create and organise your upcoming commitments.</p>

            <section className="panel add-task-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">NEW COMMITMENT</p>
                  <h2>Add a task</h2>
                </div>
              </div>

              <form className="task-form" onSubmit={createTask}>
                <label>
                  Task title
                  <input
                    type="text"
                    placeholder="e.g. Revise Applied Linear Algebra"
                    value={newTitle}
                    onChange={(event) => setNewTitle(event.target.value)}
                    required
                  />
                </label>

                <label>
                  Category
                  <select
                    value={newCategory}
                    onChange={(event) => setNewCategory(event.target.value)}
                  >
                    <option value="Other">Other</option>
                    <option value="Study">Study</option>
                    <option value="College">College</option>
                    <option value="Development">Development</option>
                    <option value="Personal">Personal</option>
                    <option value="Work">Work</option>
                  </select>
                </label>

                <label>
                  Start date and time
                  <input
                    type="datetime-local"
                    value={newStart}
                    onChange={(event) => setNewStart(event.target.value)}
                  />
                </label>

                <label>
                  End date and time
                  <input
                    type="datetime-local"
                    value={newEnd}
                    onChange={(event) => setNewEnd(event.target.value)}
                  />
                </label>

                {taskError && <p>{taskError}</p>}
                {taskSuccess && <p>{taskSuccess}</p>}

                <button
                  type="submit"
                  className="tracking-button"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : '+ Add task'}
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">YOUR COMMITMENTS</p>
                  <h2>All tasks ({tasks.length})</h2>
                </div>
              </div>

              <div className="task-list">
                {taskActionError && <p className="task-error">{taskActionError}</p>}

                {tasks.map((task) => (
                  <div
                    className={`task-row ${Boolean(task.is_completed) ? 'task-done' : ''}`}
                    key={task.id}
                  >
                    {editingTaskId === task.id ? (
                      <form
                        className="task-edit-form"
                        onSubmit={(event) => saveTask(event, task.id)}
                      >
                        <label>
                          Task title
                          <input
                            value={editTitle}
                            onChange={(event) => setEditTitle(event.target.value)}
                            required
                          />
                        </label>

                        <label>
                          Category
                          <select
                            value={editCategory}
                            onChange={(event) => setEditCategory(event.target.value)}
                          >
                            <option value="Other">Other</option>
                            <option value="Study">Study</option>
                            <option value="College">College</option>
                            <option value="Development">Development</option>
                            <option value="Personal">Personal</option>
                            <option value="Work">Work</option>
                          </select>
                        </label>

                        <label>
                          Start date and time
                          <input
                            type="datetime-local"
                            value={editStart}
                            onChange={(event) => setEditStart(event.target.value)}
                          />
                        </label>

                        <label>
                          End date and time
                          <input
                            type="datetime-local"
                            value={editEnd}
                            onChange={(event) => setEditEnd(event.target.value)}
                          />
                        </label>

                        <div className="task-actions">
                          <button type="submit" className="text-button">
                            Save changes
                          </button>

                          <button
                            type="button"
                            className="text-button"
                            onClick={() => setEditingTaskId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <button
                          className={`task-check ${Boolean(task.is_completed) ? 'checked' : ''}`}
                          onClick={() => toggleTask(task.id)}
                          aria-label="Toggle task completion"
                        >
                          {Boolean(task.is_completed) ? '✓' : ''}
                        </button>

                        <div className="task-info">
                          <strong>{task.title}</strong>
                          <span>{formatTaskTime(task)}</span>
                        </div>

                        <span className="category-tag">{task.category}</span>

                        <div className="task-actions">
                          <button
                            className="text-button"
                            onClick={() => startEditing(task)}
                          >
                            Edit
                          </button>

                          <button
                            className="text-button delete-task-button"
                            onClick={() => deleteTask(task.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {tasks.length === 0 && <p>No tasks saved yet.</p>}
              </div>
            </section>
          </section>
        ) : (
          <section className="placeholder-page">
            <p className="eyebrow">WORKSPACE / {activePage.toUpperCase()}</p>
            <h1>{activePage}<span>.</span></h1>
            <p>This section is planned for a future development milestone.</p>
            <button className="text-button" onClick={() => setActivePage('Overview')}>
              ← Back to overview
            </button>
          </section>
        )}
      </main>
    </div>
  )
}

export default App