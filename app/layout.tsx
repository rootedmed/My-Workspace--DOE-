import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Commitment Match MVP",
  description: "Commitment-oriented dating MVP with a 14-day decision track."
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
