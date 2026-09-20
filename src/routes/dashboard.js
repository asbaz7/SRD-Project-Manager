import { Hono } from "hono";
import { requireLogin, requireHod } from "../middleware.js";
import { STATUSES, getAllTasks, dashboardStats } from "../db.js";
import { renderDashboard, renderMyTasks } from "../views.js";

const dashboard = new Hono();

dashboard.get("/", requireLogin, async (c) => {
  const user = c.get("user");
  return c.redirect(user.role === "hod" ? "/dashboard" : "/my-tasks");
});

dashboard.get("/dashboard", requireHod, async (c) => {
  const db = c.env.DB;
  const [stats, all] = await Promise.all([dashboardStats(db), getAllTasks(db)]);
  return c.html(
    renderDashboard({
      user: c.get("user"),
      stats,
      statuses: STATUSES,
      recentTasks: all.slice(0, 8),
    })
  );
});

dashboard.get("/my-tasks", requireLogin, async (c) => {
  const user = c.get("user");
  if (user.role === "hod") return c.redirect("/dashboard");
  const list = await getAllTasks(c.env.DB, { onlyAssignedTo: user.id });
  return c.html(renderMyTasks({ user, tasks: list }));
});

export default dashboard;
