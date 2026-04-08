import "@xyflow/react/dist/style.css";
import "./globals.css";
import Link from "next/link";
import GlobalBeforeUnload from "@components/GlobalBeforeUnload";
import Nav from "@components/Nav";
import SectionNav from "@components/SectionNav";
import packageJson from "../package.json";

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
          <div className="container py-3">
            <div className="grid grid-cols-[auto,minmax(0,1fr)] items-center gap-x-12 gap-y-3">
              <Link href="/" className="font-semibold">
                Gemini Balance Console <span className="text-white/50 text-xs align-top">v{packageJson.version}</span>
              </Link>
              <Nav />
              <div className="col-span-2 border-t border-white/10" />
              <div aria-hidden="true" />
              <SectionNav />
            </div>
          </div>
        </header>
        <main className="container py-6">{children}</main>
      </body>
    </html>
  );
}
