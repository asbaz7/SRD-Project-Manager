import { Hono } from "hono";
import { loadUser } from "./middleware.js";
import { renderError } from "./views.js";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import taskRoutes from "./routes/tasks.js";
import staffRoutes from "./routes/staff.js";

const app = new Hono();

app.use("*", loadUser);

app.route("/", authRoutes);
app.route("/", dashboardRoutes);
app.route("/", taskRoutes);
app.route("/", staffRoutes);

app.notFound((c) => c.html(renderError({ user: c.get("user"), title: "Not found", message: "That page doesn't exist." }), 404));

export default app;
