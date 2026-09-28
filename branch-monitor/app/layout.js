import "./globals.css";

export const metadata = {
  title: "SRD Branch Monitor",
  description: "Branch work and project monitoring for SRD",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
