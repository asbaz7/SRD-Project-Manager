import { Hono } from "hono";
import { requireLogin, requireHod } from "../middleware.js";
import {
  STATUSES,
  getTaskOr404,
  getAllTasks,
  isOverdue,
  logEvent,
  getEvents,
  setAssignees,
  allActiveStaff,
} from "../db.js";
import { renderTasksList, renderTaskNew, renderTaskDetail, renderError } from "../views.js";

const tasks = new Hono();

function toArray(v) {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

// ---- List (HOD) ----
tasks.get("/tasks", requireHod, async (c) => {
  const db = c.env.DB;
  let list = await getAllTasks(db);
  const status = c.req.query("status") || "";
  const staffFilter = c.req.query("staff") || "";

  if (status) list = list.filter((t) => t.status === status);
  if (staffFilter) list = list.filter((t) => t.assignees.some((a) => String(a.id) === staffFilter));

  const staffList = await allActiveStaff(db);
  return c.html(
    renderTasksList({
      user: c.get("user"),
      tasks: list,
      statuses: STATUSES,
      staffList,
      filters: { status, staff: staffFilter },
    })
  );
});

// ---- New task ----
tasks.get("/tasks/new", requireHod, async (c) => {
  const staffList = await allActiveStaff(c.env.DB);
  return c.html(renderTaskNew({ user: c.get("user"), error: null, staffList, form: {} }));
});

tasks.post("/tasks", requireHod, async (c) => {
  const db = c.env.DB;
  const body = await c.req.parseBody({ all: true });
  const title = (body.title || "").trim();
  const description = (body.description || "").trim() || null;
  const startDate = body.start_date || null;
  const dueDate = body.due_date || null;
  const assignees = toArray(body.assignees);

  if (!title) {
    const staffList = await allActiveStaff(db);
    return c.html(renderTaskNew({ user: c.get("user"), error: "Please give the task a title.", staffList, form: body }));
  }

  const result = await db
    .prepare(`INSERT INTO tasks (title, description, start_date, due_date, created_by) VALUES (?, ?, ?, ?, ?)`)
    .bind(title, description, startDate, dueDate, c.get("user").id)
    .run();

  const taskId = result.meta.last_row_id;
  await setAssignees(db, taskId, assignees);
  await logEvent(db, { taskId, userId: c.get("user").id, type: "created", note: "Task created." });

  return c.redirect(`/tasks/${taskId}`);
});

// ---- Detail ----
tasks.get("/tasks/:id", requireLogin, async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const task = await getTaskOr404(db, c.req.param("id"));
  if (!task) return c.html(renderError({ user, title: "Not found", message: "That task does not exist." }), 404);

  const isAssigned = task.assignees.some((a) => a.id === user.id);
  if (user.role !== "hod" && !isAssigned) {
    return c.html(renderError({ user, title: "Not allowed", message: "This task isn't assigned to you." }), 403);
  }

  const [events, staffList] = await Promise.all([getEvents(db, task.id), allActiveStaff(db)]);

  return c.html(
    renderTaskDetail({
      user,
      task,
      events,
      statuses: STATUSES,
      staffList,
      isOverdue: isOverdue(task),
    })
  );
});

// ---- HOD edit ----
tasks.post("/tasks/:id/edit", requireHod, async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const task = await getTaskOr404(db, c.req.param("id"));
  if (!task) return c.redirect("/tasks");

  const body = await c.req.parseBody({ all: true });
  const title = (body.title || task.title).trim();
  const description = (body.description || "").trim() || null;
  const status = body.status || task.status;
  const startDate = body.start_date || null;
  const dueDate = body.due_date || null;
  const assignees = toArray(body.assignees);

  const changes = [];
  if (status !== task.status) changes.push(`status: ${task.status} → ${status}`);
  if (dueDate !== task.due_date && (dueDate || task.due_date)) {
    changes.push(`due date: ${task.due_date || "none"} → ${dueDate || "none"}`);
  }
  const oldIds = task.assignees.map((a) => String(a.id)).sort().join(",");
  const newIds = [...assignees].sort().join(",");
  const reassigned = oldIds !== newIds;

  await db
    .prepare(
      `UPDATE tasks SET title = ?, description = ?, status = ?, start_date = ?, due_date = ?,
         progress = CASE WHEN ? = 'completed' THEN 100 ELSE progress END,
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(title, description, status, startDate, dueDate, status, task.id)
    .run();

  await setAssignees(db, task.id, assignees);

  if (changes.length) {
    await logEvent(db, { taskId: task.id, userId: user.id, type: "edited", note: changes.join("; ") });
  }
  if (reassigned) {
    let names = [];
    if (assignees.length) {
      const placeholders = assignees.map(() => "?").join(",");
      const { results } = await db.prepare(`SELECT name FROM users WHERE id IN (${placeholders})`).bind(...assignees).all();
      names = results.map((r) => r.name);
    }
    await logEvent(db, {
      taskId: task.id,
      userId: user.id,
      type: "reassigned",
      note: names.length ? `Reassigned to: ${names.join(", ")}` : "Unassigned from all staff.",
    });
  }

  return c.redirect(`/tasks/${task.id}`);
});

// ---- Staff progress update ----
tasks.post("/tasks/:id/progress", requireLogin, async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const task = await getTaskOr404(db, c.req.param("id"));
  if (!task) return c.redirect("/my-tasks");

  const isAssigned = task.assignees.some((a) => a.id === user.id);
  if (user.role !== "hod" && !isAssigned) {
    return c.html(renderError({ user, title: "Not allowed", message: "This task isn't assigned to you." }), 403);
  }

  const body = await c.req.parseBody();
  const status = body.status || task.status;
  const progressNum = Math.max(0, Math.min(100, parseInt(body.progress, 10) || 0));
  const note = body.note || "";
  const statusChanged = status !== task.status;

  await db.prepare(`UPDATE tasks SET status = ?, progress = ?, updated_at = datetime('now') WHERE id = ?`).bind(status, progressNum, task.id).run();

  if (statusChanged) {
    await logEvent(db, {
      taskId: task.id,
      userId: user.id,
      type: "status_change",
      note: `${task.status} → ${status}${note ? `: ${note}` : ""}`,
    });
  } else {
    await logEvent(db, {
      taskId: task.id,
      userId: user.id,
      type: "progress_update",
      note: note || `Progress updated to ${progressNum}%.`,
      meta: { progress: progressNum },
    });
  }

  return c.redirect(`/tasks/${task.id}`);
});

// ---- Comments ----
tasks.post("/tasks/:id/comment", requireLogin, async (c) => {
  const db = c.env.DB;
  const user = c.get("user");
  const task = await getTaskOr404(db, c.req.param("id"));
  if (!task) return c.redirect("/tasks");

  const isAssigned = task.assignees.some((a) => a.id === user.id);
  if (user.role !== "hod" && !isAssigned) {
    return c.html(renderError({ user, title: "Not allowed", message: "This task isn't assigned to you." }), 403);
  }

  const body = await c.req.parseBody();
  const text = (body.text || "").trim();
  if (text) {
    await logEvent(db, { taskId: task.id, userId: user.id, type: "comment", note: text });
  }
  return c.redirect(`/tasks/${task.id}`);
});

export default tasks;
