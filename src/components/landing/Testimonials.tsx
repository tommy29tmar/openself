import Link from "next/link";

export function Testimonials() {
  return (
    <section className="px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-widest text-[#c9a96e]">
          Community
        </h2>
        <p className="mx-auto mb-12 max-w-xl text-center text-2xl font-bold text-white sm:text-3xl">
          Join the people building their digital identity
        </p>

        {/* Placeholder grid for future testimonials */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex flex-col rounded-2xl border border-white/8 bg-white/[0.03] p-6"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white/10" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-24 rounded bg-white/10" />
                  <div className="h-2.5 w-16 rounded bg-white/5" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-white/5" />
                <div className="h-3 w-5/6 rounded bg-white/5" />
                <div className="h-3 w-3/4 rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <Link
            href="/builder"
            className="inline-flex h-11 items-center justify-center rounded-full border border-[#c9a96e]/30 bg-[#c9a96e]/10 px-8 text-sm font-medium text-[#c9a96e] transition-colors hover:bg-[#c9a96e]/20"
          >
            Join the beta
          </Link>
        </div>
      </div>
    </section>
  );
}
