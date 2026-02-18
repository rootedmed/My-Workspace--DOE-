import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Commitment Match",
  description: "A relationship-first dating experience built for real connection."
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
