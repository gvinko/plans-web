import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plan2Print — Dollhouse Studio",
  description: "Turn a 2D floor plan into an FDM-print-ready dollhouse: walls, roof, and furniture, STL/OBJ export.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
