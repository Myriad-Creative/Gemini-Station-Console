import "@xyflow/react/dist/style.css";
import "./globals.css";
import Link from "next/link";
import GlobalBeforeUnload from "@components/GlobalBeforeUnload";
import Nav from "@components/Nav";
import SectionNav from "@components/SectionNav";

export const metadata = {
  title: "Gemini Balance Console",
  description: "Content coverage, balance, and authoring tooling for Gemini Station"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <GlobalBeforeUnload />
        <header className="border-b border-white/10">
          <div className="container py-3 space-y-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <Link href="/" className="font-semibold">
                Gemini Balance Console <span className="text-white/50 text-xs align-top">v0.2.2</span>
              </Link>
              <Nav />
            </div>
            <SectionNav />
          </div>
        </header>
        <main className="container py-6">{children}</main>
      </body>
    </html>
  );
}
