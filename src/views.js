// views.js — every page, as plain template-literal functions returning
// HTML strings. There's no templating engine dependency (EJS etc. don't
// run naturally in the Workers runtime) so escaping is manual: esc()
// MUST wrap every piece of user-supplied text (titles, names, notes,
// usernames, ...) before it goes into HTML. Fixed values we generate
// ourselves (status codes, ids, dates from <input type=date>) are safe
// to skip, but when in doubt, escape it.

export function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function initials(name) {
  return esc(
    String(name)
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase()
  );
}

const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />`;

function statusPill(status) {
  return `<span class="status-pill status-${esc(status)}">${esc(status.replace("_", " "))}</span>`;
}

function overdueFlag(task) {
  return isOverdueLocal(task) ? `<span class="overdue-flag">Overdue</span>` : "";
}

// Duplicated tiny check so views.js has no import cycle with db.js's isOverdue.
function isOverdueLocal(task) {
  if (!task.due_date || task.status === "completed") return false;
  return new Date(task.due_date + "T23:59:59") < new Date();
}

function navLinks(user) {
  if (!user) return "";
  if (user.role === "hod") {
    return `<nav class="nav-links">
      <a href="/dashboard">Dashboard</a>
      <a href="/tasks">Tasks</a>
      <a href="/staff">Staff</a>
    </nav>`;
  }
  return `<nav class="nav-links"><a href="/my-tasks">My tasks</a></nav>`;
}

function whoBar(user) {
  if (!user) return "";
  return `<div class="who">
    <span>${esc(user.name)}</span>
    <span class="role-pill">${user.role === "hod" ? "HOD" : "Staff"}</span>
    <form method="POST" action="/logout"><button type="submit" class="linklike">Log out</button></form>
  </div>`;
}

export function layout({ title, user, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} · RD Task Tracker</title>
  ${FONT_LINK}
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
<div class="app-shell">
  <header class="topbar">
    <a class="brand" href="/">RD Task Tracker <span class="brand-sub">STELCO · Regional Department</span></a>
    ${navLinks(user)}
    ${whoBar(user)}
  </header>
  <main class="container">
    ${body}
  </main>
</div>
</body>
</html>`;
}

function authPage({ title, eyebrow, heading, sub, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} · RD Task Tracker</title>
  ${FONT_LINK}
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <div class="auth-wrap">
    <div class="auth-card" style="max-width: 420px;">
      <div class="auth-eyebrow">${esc(eyebrow)}</div>
      <h1>${esc(heading)}</h1>
      <p class="sub">${sub}</p>
      ${body}
    </div>
  </div>
</body>
</html>`;
}

export function renderError({ user, title, message }) {
  return layout({
    title,
    user,
    body: `<div class="card" style="max-width: 480px; margin: 3rem auto; text-align: center;">
      <h1>${esc(title)}</h1>
      <p style="color: var(--muted);">${esc(message)}</p>
      <p><a href="/" class="btn secondary">Back to start</a></p>
    </div>`,
  });
}

export function renderLogin({ error }) {
  return authPage({
    title: "Log in",
    eyebrow: "STELCO · Regional Department",
    heading: "RD Task Tracker",
    sub: "Log in to see or update your tasks.",
    body: `
      ${error ? `<div class="error-box">${esc(error)}</div>` : ""}
      <form method="POST" action="/login">
        <div class="field">
          <label for="username">Username</label>
          <input type="text" id="username" name="username" autocomplete="username" required autofocus />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" autocomplete="current-password" required />
        </div>
        <button type="submit" class="btn" style="width: 100%; justify-content: center;">Log in</button>
      </form>
      <p style="margin-top: 1.2rem; font-size: 0.8rem; color: var(--muted);">
        Don't have an account yet? Ask your HOD to add you under Staff accounts.
      </p>`,
  });
}

export function renderSetup({ error }) {
  return authPage({
    title: "Set up your HOD account",
    eyebrow: "First-time setup",
    heading: "Create your HOD account",
    sub: "This tracker has no accounts yet. The first account you create becomes the Head of Department account, with full access to create tasks, assign staff, and comment. You can add staff accounts afterwards.",
    body: `
      ${error ? `<div class="error-box">${esc(error)}</div>` : ""}
      <form method="POST" action="/setup">
        <div class="field">
          <label for="name">Your name</label>
          <input type="text" id="name" name="name" required autofocus />
        </div>
        <div class="field">
          <label for="username">Choose a username</label>
          <input type="text" id="username" name="username" autocomplete="username" required />
        </div>
        <div class="field">
          <label for="password">Choose a password</label>
          <input type="password" id="password" name="password" autocomplete="new-password" required minlength="6" />
          <div class="hint">At least 6 characters.</div>
        </div>
        <div class="field">
          <label for="confirm">Confirm password</label>
          <input type="password" id="confirm" name="confirm" autocomplete="new-password" required minlength="6" />
        </div>
        <button type="submit" class="btn" style="width: 100%; justify-content: center;">Create HOD account</button>
      </form>`,
  });
}

function taskRow(t, opts = {}) {
  const meta = [];
  if (opts.showAssignees !== false) {
    meta.push(`<span>${esc(t.assignees.map((a) => a.name).join(", ") || "Unassigned")}</span>`);
  }
  meta.push(`<span>${t.progress}% complete</span>`);
  if (t.due_date) meta.push(`<span>Due ${esc(t.due_date)}</span>`);
  meta.push(overdueFlag(t));

  const bar = opts.showBar
    ? `<div class="progress-track" style="margin-top: 0.5rem;"><div class="progress-fill" style="width: ${t.progress}%;"></div></div>`
    : "";

  return `<a class="task-row" href="/tasks/${t.id}">
    <div class="task-row-top">
      <span class="task-title">${esc(t.title)}</span>
      ${statusPill(t.status)}
    </div>
    <div class="task-meta">${meta.join("")}</div>
    ${bar}
  </a>`;
}

export function renderDashboard({ user, stats, statuses, recentTasks }) {
  const statTiles = statuses
    .map(
      (s) => `<div class="stat-tile">
        <span class="stat-num">${stats.counts[s.value] || 0}</span>
        <span class="stat-label">${esc(s.label)}</span>
      </div>`
    )
    .join("");

  const recent =
    recentTasks.length === 0
      ? `<div class="empty-state">No tasks yet. <a href="/tasks/new">Create the first one.</a></div>`
      : recentTasks.map((t) => taskRow(t)).join("") + `<p style="margin-top: 0.75rem;"><a href="/tasks">View all tasks →</a></p>`;

  const staffTable =
    stats.byStaff.length === 0
      ? `<div class="empty-state" style="padding: 1rem;">No tasks assigned yet.</div>`
      : `<table class="data-table">
          <thead><tr><th>Staff</th><th>Tasks</th><th>Done</th></tr></thead>
          <tbody>
            ${stats.byStaff
              .map(
                (s) =>
                  `<tr><td>${esc(s.name)}</td><td class="mono">${s.total}</td><td class="mono">${s.completed || 0}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>`;

  return layout({
    title: "Dashboard",
    user,
    body: `
      <div class="page-head">
        <div>
          <h1>Dashboard</h1>
          <p style="color: var(--muted); margin: 0;">An overview of every task across the Regional Department.</p>
        </div>
        <a href="/tasks/new" class="btn">+ New task</a>
      </div>
      <div class="stat-row">
        <div class="stat-tile"><span class="stat-num">${stats.total}</span><span class="stat-label">Total tasks</span></div>
        ${statTiles}
        <div class="stat-tile overdue"><span class="stat-num">${stats.overdue}</span><span class="stat-label">Overdue</span></div>
      </div>
      <div class="two-col">
        <div class="card">
          <h2 style="font-size: 1.05rem;">Recently updated</h2>
          ${recent}
        </div>
        <div class="card">
          <h2 style="font-size: 1.05rem;">Staff workload</h2>
          ${staffTable}
        </div>
      </div>`,
  });
}

export function renderMyTasks({ user, tasks }) {
  const body =
    tasks.length === 0
      ? `<div class="empty-state">No tasks assigned to you yet.</div>`
      : tasks.map((t) => taskRow(t, { showAssignees: false, showBar: true })).join("");

  return layout({
    title: "My tasks",
    user,
    body: `
      <div class="page-head">
        <div>
          <h1>My tasks</h1>
          <p style="color: var(--muted); margin: 0;">Tasks assigned to you. Open one to update your progress.</p>
        </div>
      </div>
      <div class="card">${body}</div>`,
  });
}

export function renderTasksList({ user, tasks, statuses, staffList, filters }) {
  const statusOptions = statuses
    .map((s) => `<option value="${s.value}" ${filters.status === s.value ? "selected" : ""}>${esc(s.label)}</option>`)
    .join("");
  const staffOptions = staffList
    .map((s) => `<option value="${s.id}" ${String(filters.staff) === String(s.id) ? "selected" : ""}>${esc(s.name)}</option>`)
    .join("");

  const list =
    tasks.length === 0
      ? `<div class="empty-state">No tasks match these filters.</div>`
      : tasks.map((t) => taskRow(t, { showBar: false })).join("");

  return layout({
    title: "All tasks",
    user,
    body: `
      <div class="page-head">
        <div><h1>All tasks</h1><p style="color: var(--muted); margin: 0;">${tasks.length} task${tasks.length === 1 ? "" : "s"}</p></div>
        <a href="/tasks/new" class="btn">+ New task</a>
      </div>
      <form method="GET" action="/tasks" class="filters-bar">
        <select name="status" onchange="this.form.submit()"><option value="">All statuses</option>${statusOptions}</select>
        <select name="staff" onchange="this.form.submit()"><option value="">All staff</option>${staffOptions}</select>
        ${filters.status || filters.staff ? `<a href="/tasks" class="btn secondary small">Clear</a>` : ""}
      </form>
      <div class="card">${list}</div>`,
  });
}

function assigneeCheckboxes(staffList, checkedIds = []) {
  const checkedSet = new Set(checkedIds.map(String));
  if (staffList.length === 0) {
    return `<span style="color: var(--muted); font-size: 0.85rem;">No staff accounts yet — <a href="/staff/new">add one first</a>.</span>`;
  }
  return staffList
    .map(
      (s) => `<label>
        <input type="checkbox" name="assignees" value="${s.id}" ${checkedSet.has(String(s.id)) ? "checked" : ""} />
        ${esc(s.name)}${s.designation ? ` <span style="color: var(--muted);">(${esc(s.designation)})</span>` : ""}
      </label>`
    )
    .join("");
}

export function renderTaskNew({ user, error, staffList, form }) {
  return layout({
    title: "New task",
    user,
    body: `
      <div class="page-head"><h1>New task</h1></div>
      <div class="card" style="max-width: 620px;">
        ${error ? `<div class="error-box">${esc(error)}</div>` : ""}
        <form method="POST" action="/tasks">
          <div class="field">
            <label for="title">Title</label>
            <input type="text" id="title" name="title" required autofocus value="${esc(form.title || "")}" />
          </div>
          <div class="field">
            <label for="description">Description</label>
            <textarea id="description" name="description" placeholder="What needs to be done, and any details staff should know.">${esc(form.description || "")}</textarea>
          </div>
          <div class="field">
            <label>Assign to</label>
            <div class="checkbox-grid">${assigneeCheckboxes(staffList)}</div>
          </div>
          <div style="display: flex; gap: 1rem;">
            <div class="field" style="flex: 1;">
              <label for="start_date">Start date</label>
              <input type="date" id="start_date" name="start_date" value="${esc(form.start_date || "")}" />
            </div>
            <div class="field" style="flex: 1;">
              <label for="due_date">Due date</label>
              <input type="date" id="due_date" name="due_date" value="${esc(form.due_date || "")}" />
            </div>
          </div>
          <button type="submit" class="btn">Create task</button>
          <a href="/tasks" class="btn secondary">Cancel</a>
        </form>
      </div>`,
  });
}

function eventTypeLabel(type) {
  switch (type) {
    case "comment":
      return "commented";
    case "created":
      return "created the task";
    case "status_change":
      return "changed status";
    case "progress_update":
      return "updated progress";
    case "reassigned":
      return "reassigned the task";
    case "due_date_change":
      return "changed the due date";
    default:
      return "edited the task";
  }
}

function activityFeed(events) {
  if (events.length === 0) return `<div class="empty-state" style="padding: 1rem;">No activity yet.</div>`;
  return events
    .map(
      (e) => `<div class="event">
        <div class="event-avatar ${e.author_role === "hod" ? "hod" : ""}">${initials(e.author_name)}</div>
        <div class="event-body">
          <div class="event-head">
            <span class="event-author">${esc(e.author_name)}</span>
            <span class="event-type">${eventTypeLabel(e.type)}</span>
            <span class="event-time mono">${esc(e.created_at)}</span>
          </div>
          ${e.note ? `<div class="event-note">${esc(e.note)}</div>` : ""}
        </div>
      </div>`
    )
    .join("");
}

export function renderTaskDetail({ user, task, events, statuses, staffList, isOverdue }) {
  const statusOptions = (selected) =>
    statuses.map((s) => `<option value="${s.value}" ${task.status === s.value ? "selected" : ""}>${esc(s.label)}</option>`).join("");

  const hodEditCard =
    user.role === "hod"
      ? `<div class="card">
          <h2 style="font-size: 1.05rem;">Edit task</h2>
          <form method="POST" action="/tasks/${task.id}/edit">
            <div class="field"><label for="e_title">Title</label><input type="text" id="e_title" name="title" value="${esc(task.title)}" required /></div>
            <div class="field"><label for="e_description">Description</label><textarea id="e_description" name="description">${esc(task.description || "")}</textarea></div>
            <div class="field"><label for="e_status">Status</label><select id="e_status" name="status">${statusOptions()}</select></div>
            <div style="display: flex; gap: 0.75rem;">
              <div class="field" style="flex: 1;"><label for="e_start">Start date</label><input type="date" id="e_start" name="start_date" value="${esc(task.start_date || "")}" /></div>
              <div class="field" style="flex: 1;"><label for="e_due">Due date</label><input type="date" id="e_due" name="due_date" value="${esc(task.due_date || "")}" /></div>
            </div>
            <div class="field">
              <label>Assigned staff</label>
              <div class="checkbox-grid">${assigneeCheckboxes(staffList, task.assignees.map((a) => a.id))}</div>
            </div>
            <button type="submit" class="btn" style="width: 100%; justify-content: center;">Save changes</button>
          </form>
        </div>`
      : "";

  const isAssignedStaff = user.role === "staff" && task.assignees.some((a) => a.id === user.id);
  const staffUpdateCard = isAssignedStaff
    ? `<div class="card">
        <h2 style="font-size: 1.05rem;">Update your progress</h2>
        <form method="POST" action="/tasks/${task.id}/progress">
          <div class="field"><label for="s_status">Status</label><select id="s_status" name="status">${statusOptions()}</select></div>
          <div class="field">
            <label for="s_progress">Progress (<span id="progress_out">${task.progress}</span>%)</label>
            <input type="range" id="s_progress" name="progress" min="0" max="100" step="5" value="${task.progress}"
              oninput="document.getElementById('progress_out').textContent = this.value" />
          </div>
          <div class="field"><label for="s_note">Note (optional)</label><textarea id="s_note" name="note" placeholder="What did you do? Anything blocking you?"></textarea></div>
          <button type="submit" class="btn" style="width: 100%; justify-content: center;">Save update</button>
        </form>
      </div>`
    : "";

  return layout({
    title: task.title,
    user,
    body: `
      <div class="page-head">
        <div>
          <a href="${user.role === "hod" ? "/tasks" : "/my-tasks"}" style="font-size: 0.85rem; color: var(--muted); text-decoration: none;">← Back</a>
          <h1 style="margin-top: 0.3rem;">${esc(task.title)}</h1>
          <div class="task-meta" style="margin-top: 0.4rem;">
            ${statusPill(task.status)}
            <span>${task.progress}% complete</span>
            ${task.due_date ? `<span>Due ${esc(task.due_date)}</span>` : ""}
            ${isOverdue ? `<span class="overdue-flag">Overdue</span>` : ""}
          </div>
        </div>
      </div>
      <div class="two-col">
        <div>
          <div class="card">
            ${task.description ? `<p style="white-space: pre-wrap; margin-top: 0;">${esc(task.description)}</p>` : `<p style="color: var(--muted); margin-top: 0;">No description.</p>`}
            <div class="task-meta" style="margin-top: 0.75rem;">
              <span>Assigned to: ${esc(task.assignees.map((a) => a.name).join(", ") || "Nobody yet")}</span>
              ${task.start_date ? `<span>Started ${esc(task.start_date)}</span>` : ""}
            </div>
          </div>
          <div class="card">
            <h2 style="font-size: 1.05rem;">Activity</h2>
            ${activityFeed(events)}
            <form method="POST" action="/tasks/${task.id}/comment" style="margin-top: 1rem; border-top: 1px solid var(--border); padding-top: 1rem;">
              <div class="field"><label for="text">Add a comment</label><textarea id="text" name="text" placeholder="Leave a note for the team..." required></textarea></div>
              <button type="submit" class="btn small">Post comment</button>
            </form>
          </div>
        </div>
        <div>
          ${hodEditCard}
          ${staffUpdateCard}
        </div>
      </div>`,
  });
}

export function renderStaffList({ user, staff, error, notice }) {
  const rows = staff
    .map(
      (s) => `<tr class="${s.active ? "" : "inactive"}">
        <td>${esc(s.name)}${!s.active ? ` <span style="color: var(--muted); font-size: 0.78rem;">(disabled)</span>` : ""}</td>
        <td class="mono">${esc(s.username)}</td>
        <td class="staff-id">${esc(s.staff_id || "—")}</td>
        <td>${esc(s.designation || "—")}</td>
        <td style="text-align: right; white-space: nowrap;">
          <details style="display: inline-block;">
            <summary class="btn secondary small" style="display: inline-flex; cursor: pointer;">Reset password</summary>
            <form method="POST" action="/staff/${s.id}/reset-password" style="margin-top: 0.5rem; display: flex; gap: 0.4rem;">
              <input type="password" name="password" placeholder="New password" minlength="6" required style="width: 160px;" />
              <button type="submit" class="btn small">Set</button>
            </form>
          </details>
          <form method="POST" action="/staff/${s.id}/toggle-active" style="display: inline;">
            <button type="submit" class="btn secondary small">${s.active ? "Disable" : "Enable"}</button>
          </form>
        </td>
      </tr>`
    )
    .join("");

  const table =
    staff.length === 0
      ? `<div class="empty-state">No staff accounts yet. <a href="/staff/new">Add the first one.</a></div>`
      : `<table class="data-table">
          <thead><tr><th>Name</th><th>Username</th><th>Staff ID</th><th>Designation</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;

  return layout({
    title: "Staff accounts",
    user,
    body: `
      <div class="page-head"><h1>Staff accounts</h1><a href="/staff/new" class="btn">+ Add staff</a></div>
      ${error ? `<div class="error-box">${esc(error)}</div>` : ""}
      ${notice ? `<div class="notice-box">${esc(notice)}</div>` : ""}
      <div class="card">${table}</div>`,
  });
}

export function renderStaffNew({ user, error, form }) {
  return layout({
    title: "Add staff account",
    user,
    body: `
      <div class="page-head"><h1>Add staff account</h1></div>
      <div class="card" style="max-width: 520px;">
        ${error ? `<div class="error-box">${esc(error)}</div>` : ""}
        <form method="POST" action="/staff">
          <div class="field"><label for="name">Full name</label><input type="text" id="name" name="name" required autofocus value="${esc(form.name || "")}" /></div>
          <div style="display: flex; gap: 0.75rem;">
            <div class="field" style="flex: 1;"><label for="staff_id">Staff ID</label><input type="text" id="staff_id" name="staff_id" value="${esc(form.staff_id || "")}" placeholder="e.g. 160097" /></div>
            <div class="field" style="flex: 1;"><label for="designation">Designation</label><input type="text" id="designation" name="designation" value="${esc(form.designation || "")}" placeholder="e.g. Assistant Technician" /></div>
          </div>
          <div class="field"><label for="username">Username</label><input type="text" id="username" name="username" required value="${esc(form.username || "")}" /></div>
          <div class="field">
            <label for="password">Starting password</label>
            <input type="password" id="password" name="password" required minlength="6" />
            <div class="hint">At least 6 characters. Share this with the staff member directly — they can't reset it themselves; you can from the staff list.</div>
          </div>
          <button type="submit" class="btn">Create account</button>
          <a href="/staff" class="btn secondary">Cancel</a>
        </form>
      </div>`,
  });
}
