import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "SRD Dashboard",
  description: "Atolls, islands and gensets at a glance",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            <img src="/stelco-icon.png" alt="STELCO" width="55" height="24" />
            <span>SRD Dashboard</span>
          </Link>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
