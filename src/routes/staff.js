import { Hono } from "hono";
import { requireHod } from "../middleware.js";
import { hashPassword } from "../auth.js";
import { allStaffAccounts } from "../db.js";
import { renderStaffList, renderStaffNew } from "../views.js";

const staff = new Hono();

staff.get("/staff", requireHod, async (c) => {
  const list = await allStaffAccounts(c.env.DB);
  return c.html(renderStaffList({ user: c.get("user"), staff: list, error: null, notice: null }));
});

staff.get("/staff/new", requireHod, async (c) => {
  return c.html(renderStaffNew({ user: c.get("user"), error: null, form: {} }));
});

staff.post("/staff", requireHod, async (c) => {
  const db = c.env.DB;
  const body = await c.req.parseBody();
  const name = (body.name || "").trim();
  const username = (body.username || "").trim().toLowerCase();
  const password = body.password || "";
  const staffId = (body.staff_id || "").trim() || null;
  const designation = (body.designation || "").trim() || null;

  if (!name || !username || !password) {
    return c.html(renderStaffNew({ user: c.get("user"), error: "Name, username and a starting password are required.", form: body }));
  }
  if (password.length < 6) {
    return c.html(renderStaffNew({ user: c.get("user"), error: "Password must be at least 6 characters.", form: body }));
  }

  const existing = await db.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (existing) {
    return c.html(renderStaffNew({ user: c.get("user"), error: `Username "${username}" is already taken.`, form: body }));
  }

  const hash = await hashPassword(password);
  await db
    .prepare(`INSERT INTO users (username, password_hash, name, role, staff_id, designation) VALUES (?, ?, ?, 'staff', ?, ?)`)
    .bind(username, hash, name, staffId, designation)
    .run();

  return c.redirect("/staff");
});

staff.post("/staff/:id/reset-password", requireHod, async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const password = body.password || "";

  const person = await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'staff'").bind(id).first();
  const list = await allStaffAccounts(db);
  if (!person) return c.redirect("/staff");

  if (!password || password.length < 6) {
    return c.html(
      renderStaffList({ user: c.get("user"), staff: list, error: `Password for ${person.name} must be at least 6 characters.`, notice: null })
    );
  }

  const hash = await hashPassword(password);
  await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(hash, person.id).run();

  const refreshed = await allStaffAccounts(db);
  return c.html(
    renderStaffList({
      user: c.get("user"),
      staff: refreshed,
      error: null,
      notice: `Password reset for ${person.name}. Share the new password with them directly.`,
    })
  );
});

staff.post("/staff/:id/toggle-active", requireHod, async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const person = await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'staff'").bind(id).first();
  if (person) {
    await db.prepare("UPDATE users SET active = ? WHERE id = ?").bind(person.active ? 0 : 1, person.id).run();
  }
  return c.redirect("/staff");
});

export default staff;
