import Link from "next/link";

export function HeroSection() {
  return (
    <section className="relative px-6 pt-24 pb-20 sm:pt-32 sm:pb-28 lg:pt-40 lg:pb-36">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-0 -left-10 h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-[120px]" />
        <div className="absolute top-40 right-[-10%] h-[400px] w-[400px] rounded-full bg-purple-500/10 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center text-center">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-[#999]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#c9a96e] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#c9a96e]" />
          </span>
          Now in public beta
        </div>

        {/* Headline */}
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
          Talk for 5 minutes.
          <br />
          <span className="bg-gradient-to-r from-white to-white/50 bg-clip-text text-transparent">
            Get a living personal page.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#999] sm:text-xl">
          AI turns a short conversation into a beautifully curated digital
          presence. Connect your sources, customize your style, publish in
          one click.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex w-full flex-col items-center gap-4 sm:w-auto sm:flex-row">
          <Link
            href="/builder"
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#c9a96e] px-8 text-base font-medium text-[#111] transition-all hover:scale-105 hover:bg-[#d4b87a] active:scale-95 sm:w-auto"
          >
            Create your page
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 w-full items-center justify-center rounded-full border border-white/10 bg-white/5 px-8 text-base font-medium text-white transition-colors hover:bg-white/10 sm:w-auto"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
