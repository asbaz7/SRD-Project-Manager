import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "SRD Genset Dashboard",
  description: "Atolls, islands and gensets at a glance",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            <img src="/stelco-icon.png" alt="" width="28" height="28" />
            <span>SRD Genset Dashboard</span>
          </Link>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
