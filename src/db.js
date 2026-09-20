// db.js — D1 query helpers. Every call is async (D1 is a remote-ish
// binding even in local dev), unlike the synchronous better-sqlite3
// version this was ported from.

export const STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "on_hold", label: "On Hold" },
  { value: "delayed", label: "Delayed" },
  { value: "completed", label: "Completed" },
];

export function statusLabel(value) {
  const s = STATUSES.find((s) => s.value === value);
  return s ? s.label : value;
}

export async function hasAnyUsers(db) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM users").first();
  return row.n > 0;
}

export async function getUserByUsername(db, username) {
  return db.prepare("SELECT * FROM users WHERE username = ? AND active = 1").bind(username).first();
}

export async function getUserById(db, id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
}

export async function allActiveStaff(db) {
  const { results } = await db
    .prepare("SELECT * FROM users WHERE role = 'staff' AND active = 1 ORDER BY name")
    .all();
  return results;
}

export async function allStaffAccounts(db) {
  const { results } = await db
    .prepare("SELECT * FROM users WHERE role = 'staff' ORDER BY active DESC, name ASC")
    .all();
  return results;
}

async function withAssignees(db, task) {
  const { results } = await db
    .prepare(
      `SELECT u.id, u.name, u.staff_id
       FROM task_assignees ta
       JOIN users u ON u.id = ta.user_id
       WHERE ta.task_id = ?
       ORDER BY u.name`
    )
    .bind(task.id)
    .all();
  return { ...task, assignees: results };
}

export async function getTaskOr404(db, id) {
  const task = await db.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first();
  return task ? withAssignees(db, task) : null;
}

export async function getAllTasks(db, { onlyAssignedTo } = {}) {
  let tasks;
  if (onlyAssignedTo) {
    const { results } = await db
      .prepare(
        `SELECT DISTINCT t.* FROM tasks t
         JOIN task_assignees ta ON ta.task_id = t.id
         WHERE ta.user_id = ?
         ORDER BY t.updated_at DESC`
      )
      .bind(onlyAssignedTo)
      .all();
    tasks = results;
  } else {
    const { results } = await db.prepare("SELECT * FROM tasks ORDER BY updated_at DESC").all();
    tasks = results;
  }
  return Promise.all(tasks.map((t) => withAssignees(db, t)));
}

export function isOverdue(task) {
  if (!task.due_date || task.status === "completed") return false;
  return new Date(task.due_date + "T23:59:59") < new Date();
}

export async function setAssignees(db, taskId, userIds) {
  await db.prepare("DELETE FROM task_assignees WHERE task_id = ?").bind(taskId).run();
  for (const id of userIds) {
    await db.prepare("INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)").bind(taskId, id).run();
  }
}

export async function logEvent(db, { taskId, userId, type, note, meta }) {
  await db
    .prepare(`INSERT INTO task_events (task_id, user_id, type, note, meta) VALUES (?, ?, ?, ?, ?)`)
    .bind(taskId, userId, type, note || null, meta ? JSON.stringify(meta) : null)
    .run();
}

export async function getEvents(db, taskId) {
  const { results } = await db
    .prepare(
      `SELECT e.*, u.name AS author_name, u.role AS author_role
       FROM task_events e
       JOIN users u ON u.id = e.user_id
       WHERE e.task_id = ?
       ORDER BY e.created_at ASC`
    )
    .bind(taskId)
    .all();
  return results.map((e) => ({ ...e, meta: e.meta ? JSON.parse(e.meta) : null }));
}

export async function dashboardStats(db) {
  const counts = {};
  for (const s of STATUSES) counts[s.value] = 0;
  const { results: statusRows } = await db.prepare("SELECT status, COUNT(*) AS n FROM tasks GROUP BY status").all();
  for (const r of statusRows) counts[r.status] = r.n;

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const overdueRow = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM tasks
       WHERE due_date IS NOT NULL AND due_date != ''
         AND status != 'completed'
         AND date(due_date) < date('now')`
    )
    .first();

  const { results: byStaff } = await db
    .prepare(
      `SELECT u.id, u.name,
              COUNT(*) AS total,
              SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM task_assignees ta
       JOIN users u ON u.id = ta.user_id
       JOIN tasks t ON t.id = ta.task_id
       GROUP BY u.id
       ORDER BY total DESC`
    )
    .all();

  return { counts, total, overdue: overdueRow.n, byStaff };
}
