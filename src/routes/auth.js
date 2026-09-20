import { Hono } from "hono";
import { hashPassword, verifyPassword, createSession, destroySession, setSessionCookie, clearSessionCookie, getSessionToken } from "../auth.js";
import { hasAnyUsers, getUserByUsername } from "../db.js";
import { renderLogin, renderSetup } from "../views.js";

const auth = new Hono();

auth.get("/setup", async (c) => {
  if (await hasAnyUsers(c.env.DB)) return c.redirect("/login");
  return c.html(renderSetup({ error: null }));
});

auth.post("/setup", async (c) => {
  const db = c.env.DB;
  if (await hasAnyUsers(db)) return c.redirect("/login");

  const body = await c.req.parseBody();
  const name = (body.name || "").trim();
  const username = (body.username || "").trim().toLowerCase();
  const password = body.password || "";
  const confirm = body.confirm || "";

  if (!name || !username || !password) {
    return c.html(renderSetup({ error: "Please fill in your name, a username and a password." }));
  }
  if (password.length < 6) {
    return c.html(renderSetup({ error: "Password must be at least 6 characters." }));
  }
  if (password !== confirm) {
    return c.html(renderSetup({ error: "Passwords do not match." }));
  }

  const hash = await hashPassword(password);
  const result = await db
    .prepare(`INSERT INTO users (username, password_hash, name, role, staff_id, designation) VALUES (?, ?, ?, 'hod', NULL, 'Head of Department')`)
    .bind(username, hash, name)
    .run();

  const userId = result.meta.last_row_id;
  const token = await createSession(db, userId);
  setSessionCookie(c, token);
  return c.redirect("/dashboard");
});

auth.get("/login", async (c) => {
  if (!(await hasAnyUsers(c.env.DB))) return c.redirect("/setup");
  if (c.get("user")) return c.redirect("/");
  return c.html(renderLogin({ error: null }));
});

auth.post("/login", async (c) => {
  const db = c.env.DB;
  const body = await c.req.parseBody();
  const username = (body.username || "").trim().toLowerCase();
  const password = body.password || "";

  const user = await getUserByUsername(db, username);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.html(renderLogin({ error: "Incorrect username or password." }));
  }

  const token = await createSession(db, user.id);
  setSessionCookie(c, token);
  return c.redirect(user.role === "hod" ? "/dashboard" : "/my-tasks");
});

auth.post("/logout", async (c) => {
  await destroySession(c.env.DB, getSessionToken(c));
  clearSessionCookie(c);
  return c.redirect("/login");
});

export default auth;
