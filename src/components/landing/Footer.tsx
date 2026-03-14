import { Github } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/8 px-6 py-12">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 sm:flex-row sm:items-start sm:justify-between">
        {/* Brand */}
        <div className="text-center sm:text-left">
          <span className="text-sm font-semibold tracking-tight text-white">
            OpenSelf
          </span>
          <p className="mt-1 text-xs text-[#666]">
            Built with AI. Open source under AGPL-3.0.
          </p>
        </div>

        {/* Links */}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-[#999]">
          <span className="text-zinc-500 cursor-default" title="Coming soon">Privacy Policy</span>
          <span className="text-zinc-500 cursor-default" title="Coming soon">Terms of Service</span>
          <a
            href="https://github.com/openself"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
