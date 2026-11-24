import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiRequest, jsonOptions } from './api'
import type { Activity, Insights, JournalEntry, Reminder, Task, TimeSession } from './types'

type FeaturePageProps = {
  apiUrl: string
}

type TimeTrackingPageProps = FeaturePageProps & {
  tasks: Task[]
  activities: Activity[]
}

type RemindersPageProps = FeaturePageProps & {
  tasks: Task[]
  onReminderDismissed: (id: number) => void
}

function localDate(value = new Date()) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localDateTimeInput(value: string) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatLongDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatMoment(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number) {
  const totalMinutes = Math.floor(Math.max(0, seconds) / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}

function linkedLabel(
  session: TimeSession,
  tasks: Task[],
  activities: Activity[],
) {
  if (session.task_id !== null) {
    return tasks.find((task) => task.id === session.task_id)?.title ?? 'Deleted task'
  }
  if (session.activity_id !== null) {
    return activities.find((activity) => activity.id === session.activity_id)?.title ?? 'Deleted activity'
  }
  return 'Unlinked session'
}

function associationOptions(tasks: Task[], activities: Activity[]) {
  return [
    { value: '', label: 'No linked task or activity' },
    ...tasks.map((task) => ({ value: `task:${task.id}`, label: `Task · ${task.title}` })),
    ...activities.map((activity) => ({
      value: `activity:${activity.id}`,
      label: `Schedule · ${activity.title}`,
    })),
  ]
}

function associationPayload(value: string) {
  const [kind, id] = value.split(':')
  return {
    task_id: kind === 'task' ? Number(id) : null,
    activity_id: kind === 'activity' ? Number(id) : null,
  }
}

export function TimeTrackingPage({ apiUrl, tasks, activities }: TimeTrackingPageProps) {
  const [sessions, setSessions] = useState<TimeSession[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [association, setAssociation] = useState('')
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [now, setNow] = useState(0)
  const activeSession = sessions.find((session) => session.ended_at === null)
  const activeSessionId = activeSession?.id
  const options = associationOptions(tasks, activities)

  const loadSessions = useCallback(async () => {
    try {
      const data = await apiRequest<TimeSession[]>(apiUrl, '/time-sessions')
      setSessions(data)
      setError('')
    } catch (loadError) {
      console.error(loadError)
      setError(loadError instanceof Error ? loadError.message : 'Could not load time sessions.')
    } finally {
      setLoading(false)
    }
  }, [apiUrl])

  useEffect(() => {
    void Promise.resolve().then(loadSessions)
  }, [loadSessions])

  useEffect(() => {
    if (activeSessionId === undefined) return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [activeSessionId])

  async function startTimer() {
    setSaving(true)
    setError('')
    try {
      await apiRequest<TimeSession>(
        apiUrl,
        '/time-sessions/start',
        jsonOptions('POST', associationPayload(association)),
      )
      setAssociation('')
      await loadSessions()
    } catch (startError) {
      console.error(startError)
      setError(startError instanceof Error ? startError.message : 'Could not start the timer.')
    } finally {
      setSaving(false)
    }
  }

  async function stopTimer() {
    setSaving(true)
    setError('')
    try {
      await apiRequest<TimeSession>(apiUrl, '/time-sessions/stop', { method: 'POST' })
      await loadSessions()
    } catch (stopError) {
      console.error(stopError)
      setError(stopError instanceof Error ? stopError.message : 'Could not stop the timer.')
    } finally {
      setSaving(false)
    }
  }

  async function saveManualSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await apiRequest<TimeSession>(
        apiUrl,
        '/time-sessions',
        jsonOptions('POST', {
          started_at: manualStart,
          ended_at: manualEnd,
          ...associationPayload(association),
        }),
      )
      setManualStart('')
      setManualEnd('')
      setAssociation('')
      await loadSessions()
    } catch (saveError) {
      console.error(saveError)
      setError(saveError instanceof Error ? saveError.message : 'Could not save the time entry.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteSession(session: TimeSession) {
    if (!window.confirm('Delete this recorded time session?')) return
    setError('')
    try {
      await apiRequest<{ message: string }>(
        apiUrl,
        `/time-sessions/${session.id}`,
        { method: 'DELETE' },
      )
      await loadSessions()
    } catch (deleteError) {
      console.error(deleteError)
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the session.')
    }
  }

  const linkedSessions = sessions.map((session) => {
    const end = session.ended_at ? new Date(session.ended_at).getTime() : now
    const start = new Date(session.started_at).getTime()
    return { session, seconds: Math.floor(Math.max(0, end - start) / 1000) }
  })
  const totalSeconds = linkedSessions.reduce((total, item) => total + item.seconds, 0)

  return (
    <section className="page-section feature-page time-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE / TIME</p>
          <h1>Time<span>.</span></h1>
          <p className="welcome-subtitle">Record focused time against a task or schedule block.</p>
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <div className="feature-columns time-columns">
        <section className="panel timer-panel" aria-labelledby="timer-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{activeSession ? 'IN PROGRESS' : 'READY WHEN YOU ARE'}</p>
              <h2 id="timer-heading">{activeSession ? 'Current session' : 'Start a session'}</h2>
            </div>
            <span className={`timer-indicator ${activeSession ? 'running' : ''}`} aria-hidden="true" />
          </div>
          {activeSession ? (
            <div className="timer-running">
              <strong className="timer-clock" aria-live="off">
                {formatDuration(Math.floor((now - new Date(activeSession.started_at).getTime()) / 1000))}
              </strong>
              <p>{linkedLabel(activeSession, tasks, activities)}</p>
              <span>Started {formatMoment(activeSession.started_at)}</span>
              <button className="primary-button" type="button" disabled={saving} onClick={() => void stopTimer()}>
                {saving ? 'Stopping…' : 'Stop timer'}
              </button>
            </div>
          ) : (
            <div className="timer-start">
              <label className="feature-label">
                Link to
                <select value={association} onChange={(event) => setAssociation(event.target.value)}>
                  {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                </select>
              </label>
              <button className="primary-button" type="button" disabled={saving} onClick={() => void startTimer()}>
                {saving ? 'Starting…' : 'Start timer'}
              </button>
            </div>
          )}
          <p className="feature-footnote">The timer is stored on this device and continues across refreshes.</p>
        </section>

        <section className="panel time-summary-panel" aria-label="Recorded time summary">
          <p className="eyebrow">RECORDED HERE</p>
          <strong className="feature-total">{formatDuration(totalSeconds)}</strong>
          <p>{sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} loaded</p>
          <span>Showing the latest 100 recorded sessions.</span>
        </section>
      </div>

      <details className="panel manual-entry">
        <summary>Record time manually</summary>
        <form className="task-form" onSubmit={(event) => void saveManualSession(event)}>
          <label>
            Start
            <input required type="datetime-local" value={manualStart} onChange={(event) => setManualStart(event.target.value)} />
          </label>
          <label>
            End
            <input required type="datetime-local" value={manualEnd} onChange={(event) => setManualEnd(event.target.value)} />
          </label>
          <label className="full-field">
            Link to
            <select value={association} onChange={(event) => setAssociation(event.target.value)}>
              {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={saving || !manualStart || !manualEnd}>
              Save time entry
            </button>
          </div>
        </form>
      </details>

      <section className="panel session-history" aria-labelledby="session-history-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">TIME HISTORY</p>
            <h2 id="session-history-heading">Recorded sessions</h2>
          </div>
          <span className="panel-count">{sessions.length} shown</span>
        </div>
        {loading ? <p className="loading-state">Loading sessions…</p> : linkedSessions.length ? (
          <div className="session-list">
            {linkedSessions.map(({ session, seconds }) => (
              <article className="session-row" key={session.id}>
                <div>
                  <strong>{linkedLabel(session, tasks, activities)}</strong>
                  <span>{formatMoment(session.started_at)}{session.ended_at ? ` – ${formatMoment(session.ended_at)}` : ' · still running'}</span>
                </div>
                <span className="duration">{formatDuration(seconds)}</span>
                {session.ended_at && (
                  <button className="inline-button danger" type="button" onClick={() => void deleteSession(session)}>
                    Delete
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-mark" aria-hidden="true">○</span>
            <div><strong>No time recorded yet</strong><p>Start a timer or add a completed session manually.</p></div>
          </div>
        )}
      </section>
    </section>
  )
}

export function JournalPage({ apiUrl }: FeaturePageProps) {
  const [entryDate, setEntryDate] = useState(localDate)
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [content, setContent] = useState('')
  const [loadedDate, setLoadedDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    apiRequest<JournalEntry | null>(
      apiUrl,
      `/journal/${entryDate}`,
      { signal: controller.signal },
    ).then((savedEntry) => {
      setEntry(savedEntry)
      setContent(savedEntry?.content ?? '')
      setError('')
      setLoadedDate(entryDate)
    }).catch((loadError: unknown) => {
      if (controller.signal.aborted) return
      console.error(loadError)
      setError(loadError instanceof Error ? loadError.message : 'Could not load the journal entry.')
      setEntry(null)
      setContent('')
      setLoadedDate(entryDate)
    })
    return () => controller.abort()
  }, [apiUrl, entryDate])

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const savedEntry = await apiRequest<JournalEntry>(
        apiUrl,
        `/journal/${entryDate}`,
        jsonOptions('PUT', { content }),
      )
      setEntry(savedEntry)
      setContent(savedEntry.content)
    } catch (saveError) {
      console.error(saveError)
      setError(saveError instanceof Error ? saveError.message : 'Could not save the journal entry.')
    } finally {
      setSaving(false)
    }
  }

  const loading = loadedDate !== entryDate

  async function deleteEntry() {
    if (!entry || !window.confirm(`Delete the journal entry for ${formatLongDate(entryDate)}?`)) return
    setError('')
    try {
      await apiRequest<{ message: string }>(
        apiUrl,
        `/journal/${entryDate}`,
        { method: 'DELETE' },
      )
      setEntry(null)
      setContent('')
    } catch (deleteError) {
      console.error(deleteError)
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the journal entry.')
    }
  }

  return (
    <section className="page-section feature-page journal-page">
      <header className="page-heading schedule-heading">
        <div>
          <p className="eyebrow">PERSONAL / JOURNAL</p>
          <h1>Journal<span>.</span></h1>
          <p className="welcome-subtitle">A quiet place to leave a note about the day.</p>
        </div>
        <label className="date-picker">
          Entry date
          <input type="date" value={entryDate} onChange={(event) => event.target.value && setEntryDate(event.target.value)} />
        </label>
      </header>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <section className="panel journal-editor" aria-label={`Journal entry for ${formatLongDate(entryDate)}`}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{formatLongDate(entryDate)}</p>
            <h2>{entry ? 'Your entry' : 'A note for today'}</h2>
          </div>
          {entry && <span className="panel-count">Saved {formatMoment(entry.updated_at)}</span>}
        </div>
        {loading ? <p className="loading-state">Opening your journal…</p> : (
          <form onSubmit={(event) => void saveEntry(event)}>
            <label className="visually-hidden" htmlFor="journal-content">Journal entry</label>
            <textarea
              id="journal-content"
              className="journal-textarea"
              rows={9}
              maxLength={20000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="What would you like to remember about this day?"
            />
            <div className="journal-footer">
              <span>{content.length.toLocaleString()} / 20,000 characters</span>
              <div className="form-actions">
                {entry && (
                  <button className="inline-button danger" type="button" onClick={() => void deleteEntry()}>
                    Delete entry
                  </button>
                )}
                <button className="primary-button" type="submit" disabled={saving || !content.trim()}>
                  {saving ? 'Saving…' : entry ? 'Save changes' : 'Save entry'}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
      <p className="feature-footnote journal-footnote">Entries are stored in your local Chronicle database.</p>
    </section>
  )
}

export function InsightsPage({ apiUrl }: FeaturePageProps) {
  const [selectedDate, setSelectedDate] = useState(localDate)
  const [insights, setInsights] = useState<Insights | null>(null)
  const [loadedDate, setLoadedDate] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    apiRequest<Insights>(
      apiUrl,
      `/insights?date=${encodeURIComponent(selectedDate)}`,
      { signal: controller.signal },
    ).then((data) => {
      setInsights(data)
      setError('')
      setLoadedDate(selectedDate)
    }).catch((loadError: unknown) => {
      if (controller.signal.aborted) return
      console.error(loadError)
      setError(loadError instanceof Error ? loadError.message : 'Could not load insights.')
      setLoadedDate(selectedDate)
    })
    return () => controller.abort()
  }, [apiUrl, selectedDate])

  const loading = loadedDate !== selectedDate
  const hasWeekData = Boolean(
    insights && (
      insights.week.tracked_seconds
      || insights.week.tasks_completed
      || insights.week.planned_minutes
    ),
  )
  const maxTracked = Math.max(1, ...(insights?.week.days.map((day) => day.tracked_seconds) ?? []))

  return (
    <section className="page-section feature-page insights-page">
      <header className="page-heading schedule-heading">
        <div>
          <p className="eyebrow">REFLECT / FROM YOUR RECORDS</p>
          <h1>Insights<span>.</span></h1>
          <p className="welcome-subtitle">A factual view of time tracked and tasks completed.</p>
        </div>
        <label className="date-picker">
          Day in view
          <input type="date" value={selectedDate} onChange={(event) => event.target.value && setSelectedDate(event.target.value)} />
        </label>
      </header>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {loading ? <p className="loading-state">Gathering your records…</p> : insights ? (
        <>
          <section className="stats-grid insight-stats" aria-label="Selected day insights">
            <article className="stat-card">
              <span className="stat-label">TRACKED TODAY</span>
              <strong>{formatDuration(insights.today.tracked_seconds)}</strong>
              <span className="stat-note">{insights.today.sessions} recorded sessions</span>
            </article>
            <article className="stat-card">
              <span className="stat-label">COMPLETED TODAY</span>
              <strong>{insights.today.tasks_completed}</strong>
              <span className="stat-note">{insights.today.tasks_due} tasks due that day</span>
            </article>
            <article className="stat-card">
              <span className="stat-label">PLANNED THAT DAY</span>
              <strong>{formatDuration(insights.today.planned_minutes * 60)}</strong>
              <span className="stat-note">From saved schedule blocks</span>
            </article>
            <article className="stat-card">
              <span className="stat-label">COMPLETED TASKS</span>
              <strong>{insights.current_completed_tasks}</strong>
              <span className="stat-note">Currently marked complete</span>
            </article>
          </section>

          {!insights.completion_history_available && (
            <p className="insight-note">
              Completion history begins when you complete tasks from this version onward. Older completed tasks are not assigned invented dates.
            </p>
          )}

          <section className="panel weekly-insights" aria-labelledby="weekly-insights-heading">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">MONDAY – SUNDAY</p>
                <h2 id="weekly-insights-heading">This week</h2>
              </div>
              <span className="panel-count">{insights.week.start_date} – {insights.week.end_date}</span>
            </div>
            <div className="week-summary">
              <div><strong>{formatDuration(insights.week.tracked_seconds)}</strong><span>tracked</span></div>
              <div><strong>{insights.week.tasks_completed}</strong><span>completed</span></div>
              <div><strong>{formatDuration(insights.week.planned_minutes * 60)}</strong><span>planned</span></div>
            </div>
            {hasWeekData ? (
              <div className="insight-days">
                {insights.week.days.map((day) => (
                  <div className="insight-day" key={day.date}>
                    <time dateTime={day.date}>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</time>
                    <div className="insight-bar-track" role="progressbar" aria-label={`Tracked time on ${day.date}`} aria-valuemin={0} aria-valuemax={maxTracked} aria-valuenow={day.tracked_seconds}>
                      <span style={{ width: `${Math.min(100, day.tracked_seconds / maxTracked * 100)}%` }} />
                    </div>
                    <span className="insight-day-value">{day.tracked_seconds ? formatDuration(day.tracked_seconds) : '—'}</span>
                    <span className="insight-day-tasks">{day.tasks_completed} tasks</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state insight-empty">
                <span className="empty-mark" aria-hidden="true">○</span>
                <div><strong>No activity recorded this week</strong><p>Tracked time, completions and planned time will appear here when saved.</p></div>
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  )
}

export function RemindersPage({ apiUrl, tasks, onReminderDismissed }: RemindersPageProps) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(0)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [taskId, setTaskId] = useState('')
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )

  const loadReminders = useCallback(async () => {
    try {
      setReminders(await apiRequest<Reminder[]>(apiUrl, '/reminders'))
      setNow(Date.now())
      setError('')
    } catch (loadError) {
      console.error(loadError)
      setError(loadError instanceof Error ? loadError.message : 'Could not load reminders.')
    } finally {
      setLoading(false)
    }
  }, [apiUrl])

  useEffect(() => {
    void Promise.resolve().then(loadReminders)
  }, [loadReminders])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  async function requestNotificationPermission() {
    if (typeof Notification === 'undefined') {
      setPermission('unsupported')
      return
    }
    try {
      setPermission(await Notification.requestPermission())
    } catch (permissionError) {
      console.error(permissionError)
      setError('Could not request browser notification permission.')
    }
  }

  function resetForm() {
    setEditingId(null)
    setTitle('')
    setDueAt('')
    setTaskId('')
  }

  async function saveReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      title,
      due_at: dueAt,
      task_id: taskId ? Number(taskId) : null,
    }
    try {
      await apiRequest<Reminder>(
        apiUrl,
        editingId ? `/reminders/${editingId}` : '/reminders',
        jsonOptions(editingId ? 'PATCH' : 'POST', payload),
      )
      resetForm()
      await loadReminders()
    } catch (saveError) {
      console.error(saveError)
      setError(saveError instanceof Error ? saveError.message : 'Could not save the reminder.')
    } finally {
      setSaving(false)
    }
  }

  function editReminder(reminder: Reminder) {
    setEditingId(reminder.id)
    setTitle(reminder.title)
    setDueAt(localDateTimeInput(reminder.due_at))
    setTaskId(reminder.task_id?.toString() ?? '')
  }

  async function dismissReminder(reminder: Reminder) {
    setError('')
    try {
      await apiRequest<{ message: string }>(
        apiUrl,
        `/reminders/${reminder.id}/dismiss`,
        { method: 'POST' },
      )
      setReminders((current) => current.filter((item) => item.id !== reminder.id))
      onReminderDismissed(reminder.id)
    } catch (dismissError) {
      console.error(dismissError)
      setError(dismissError instanceof Error ? dismissError.message : 'Could not dismiss the reminder.')
    }
  }

  async function deleteReminder(reminder: Reminder) {
    if (!window.confirm(`Delete the reminder "${reminder.title}"?`)) return
    setError('')
    try {
      await apiRequest<{ message: string }>(
        apiUrl,
        `/reminders/${reminder.id}`,
        { method: 'DELETE' },
      )
      setReminders((current) => current.filter((item) => item.id !== reminder.id))
      onReminderDismissed(reminder.id)
    } catch (deleteError) {
      console.error(deleteError)
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the reminder.')
    }
  }

  return (
    <section className="page-section feature-page reminders-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">PLAN / REMINDERS</p>
          <h1>Reminders<span>.</span></h1>
          <p className="welcome-subtitle">A gentle prompt for something you do not want to forget.</p>
        </div>
      </header>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <p className="reminder-limitation">
        Reminders are checked while Chronicle is open. Browser notifications may be delayed when backgrounded; they cannot fire after you close Chronicle or your browser.
      </p>
      <div className="feature-columns reminder-columns">
        <section className="panel reminder-editor">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{editingId ? 'UPDATE REMINDER' : 'NEW REMINDER'}</p>
              <h2>{editingId ? 'Edit reminder' : 'Set a reminder'}</h2>
            </div>
          </div>
          <form className="task-form" onSubmit={(event) => void saveReminder(event)}>
            <label className="full-field">
              Title
              <input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What would you like to remember?" />
            </label>
            <label className="full-field">
              When
              <input required type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
            </label>
            <label className="full-field">
              Related task
              <select value={taskId} onChange={(event) => setTaskId(event.target.value)}>
                <option value="">No linked task</option>
                {tasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}
              </select>
            </label>
            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={saving || !title.trim() || !dueAt}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add reminder'}
              </button>
              {editingId && <button className="secondary-button" type="button" onClick={resetForm}>Cancel</button>}
            </div>
          </form>
        </section>

        <section className="panel reminder-list-panel" aria-labelledby="reminder-list-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">UPCOMING / DUE</p>
              <h2 id="reminder-list-heading">Your reminders</h2>
            </div>
            {permission === 'default' && (
              <button className="secondary-button" type="button" onClick={() => void requestNotificationPermission()}>
                Enable browser notifications
              </button>
            )}
            {permission === 'granted' && <span className="panel-count">Browser notifications enabled</span>}
            {permission === 'denied' && <span className="panel-count">Browser notifications blocked</span>}
            {permission === 'unsupported' && <span className="panel-count">In-app only</span>}
          </div>
          {loading ? <p className="loading-state">Loading reminders…</p> : reminders.length ? (
            <div className="reminder-list">
              {reminders.map((reminder) => {
                const due = now > 0 && new Date(reminder.due_at).getTime() <= now
                return (
                  <article className={`reminder-row ${due ? 'due' : ''}`} key={reminder.id}>
                    <div className="reminder-copy">
                      <strong>{reminder.title}</strong>
                      <span>{formatMoment(reminder.due_at)}{reminder.task_title ? ` · ${reminder.task_title}` : ''}</span>
                    </div>
                    <span className="reminder-status">{due ? 'Due' : reminder.notified_at ? 'Notified' : 'Upcoming'}</span>
                    {due && <button className="inline-button" type="button" onClick={() => void dismissReminder(reminder)}>Dismiss</button>}
                    <button className="inline-button" type="button" onClick={() => editReminder(reminder)}>Edit</button>
                    <button className="inline-button danger" type="button" onClick={() => void deleteReminder(reminder)}>Delete</button>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-mark" aria-hidden="true">○</span>
              <div><strong>No reminders set</strong><p>Add a date and time to create your first reminder.</p></div>
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
