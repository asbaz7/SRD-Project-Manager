import Link from "next/link";
import { logoutAction } from "@/app/actions";

const nav = [
  ["/dashboard", "Operations"],
];

export default function AppShell({ profile, children }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/dashboard" className="brand">
          <span className="brand-logo-box"><img src="/stelco-icon.png" alt="STELCO" /></span>
          <span className="brand-copy"><strong>SRD</strong><span>Powerhouse Monitor</span></span>
        </Link>
        <nav className="nav-links">
          {nav.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <div className="user-menu">
          <div><strong>{profile.full_name}</strong><span>{profile.role === "developer" ? "Developer" : profile.role === "hod" ? "HOD" : profile.role === "unit_head" ? "Unit Head" : profile.role === "viewer" ? "Viewer" : "Staff"}</span></div>
          <form action={logoutAction}><button className="link-btn">Sign out</button></form>
        </div>
      </header>
      <main className="container">{children}</main>
    </div>
  );
}
