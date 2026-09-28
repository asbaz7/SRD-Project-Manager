export function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}
export function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
export function titleCase(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (x) => x.toUpperCase());
}
