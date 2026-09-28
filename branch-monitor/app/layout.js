import "./globals.css";

export const metadata = {
  title: "SRD Powerhouse Monitor",
  description: "Electricity continuity and genset condition monitoring for SRD",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
