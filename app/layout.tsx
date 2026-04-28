import "@xyflow/react/dist/style.css";
import "./globals.css";
import GlobalBeforeUnload from "@components/GlobalBeforeUnload";
import NavigationHeader from "@components/NavigationHeader";
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
            <NavigationHeader version={packageJson.version} />
          </div>
        </header>
        <main className="container py-6">{children}</main>
      </body>
    </html>
  );
}
