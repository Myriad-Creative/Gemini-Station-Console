import Link from "next/link";

export default function AuthoringPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">Authoring</h1>
        <p className="max-w-3xl text-sm text-white/70">
          The old combined authoring workspace has been split into dedicated builder pages. Use the links below to jump straight into the current tools.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Link href="/missions/creator" className="card block space-y-3 transition hover:border-cyan-300/30 hover:bg-white/[0.04]">
          <div className="text-xl font-semibold text-white">Mission Creator</div>
          <div className="text-sm leading-6 text-white/65">Open the standalone mission builder and export mission draft JSON.</div>
        </Link>
        <Link href="/mods/builder" className="card block space-y-3 transition hover:border-cyan-300/30 hover:bg-white/[0.04]">
          <div className="text-xl font-semibold text-white">Mod Builder</div>
          <div className="text-sm leading-6 text-white/65">Open the standalone mod builder and auto-generator workspace.</div>
        </Link>
      </div>
    </div>
  );
}
