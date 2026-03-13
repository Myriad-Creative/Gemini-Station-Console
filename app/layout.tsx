import "./globals.css";
import Link from "next/link";
import Nav from "@components/Nav";

export const metadata = {
  title: "Gemini Balance Console",
  description: "Content coverage, balance, and authoring tooling for Gemini Station"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-white/10">
          <div className="container flex items-center justify-between h-14">
            <Link href="/" className="font-semibold">Gemini Balance Console <span className="text-white/50 text-xs align-top">v0.2.2</span></Link>
            <Nav />
          </div>
        </header>
        <main className="container py-6">{children}</main>
      </body>
    </html>
  );
}
