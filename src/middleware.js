// middleware.js — Hono middleware: load the logged-in user from the
// session cookie, and guard routes by role.

import { getSessionToken } from "./auth.js";
import { renderError } from "./views.js";

export async function loadUser(c, next) {
  const token = getSessionToken(c);
  let user = null;
  if (token) {
    const row = await c.env.DB.prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now') AND u.active = 1`
    )
      .bind(token)
      .first();
    user = row || null;
  }
  c.set("user", user);
  await next();
}

export async function requireLogin(c, next) {
  if (!c.get("user")) return c.redirect("/login");
  await next();
}

export async function requireHod(c, next) {
  const user = c.get("user");
  if (!user) return c.redirect("/login");
  if (user.role !== "hod") {
    return c.html(renderError({ user, title: "Not allowed", message: "Only the HOD account can do that." }), 403);
  }
  await next();
}
