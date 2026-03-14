export function LiveExample() {
  return (
    <section className="px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-widest text-[#c9a96e]">
          See it in action
        </h2>
        <p className="mx-auto mb-12 max-w-xl text-center text-2xl font-bold text-white sm:text-3xl">
          A real OpenSelf page
        </p>

        {/* Browser mockup */}
        <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] shadow-2xl">
          {/* Window chrome */}
          <div className="flex h-10 items-center gap-1.5 border-b border-white/8 bg-white/[0.02] px-4">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
            <div className="ml-4 flex-1">
              <div className="mx-auto h-5 max-w-xs rounded-md bg-white/5 px-3 text-center text-[11px] leading-5 text-[#666]">
                openself.dev/demo
              </div>
            </div>
          </div>

          {/* Page mockup content */}
          <div className="relative aspect-[16/9] bg-gradient-to-br from-[#1a1a18] via-[#111110] to-[#1a1a18] p-6 sm:p-10 md:p-16">
            {/* Subtle grid */}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px]" />

            {/* Bento grid skeleton */}
            <div className="relative z-10 mx-auto grid h-full max-w-3xl grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
              {/* Profile card */}
              <div className="flex flex-col justify-end rounded-2xl border border-white/8 bg-white/[0.04] p-6 md:col-span-2 md:row-span-2">
                <div className="mb-5 h-14 w-14 rounded-full bg-gradient-to-tr from-[#c9a96e]/30 to-[#c9a96e]/10 sm:h-16 sm:w-16" />
                <div className="space-y-2.5">
                  <div className="h-6 w-3/4 rounded-lg bg-white/10" />
                  <div className="h-3.5 w-1/2 rounded-md bg-white/5" />
                  <div className="h-3.5 w-5/6 rounded-md bg-white/5" />
                </div>
              </div>

              {/* Side cards */}
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                <div className="h-full w-full rounded-xl bg-white/5" />
              </div>
              <div className="flex flex-col gap-2.5 rounded-2xl border border-white/8 bg-[#c9a96e]/5 p-5">
                <div className="h-3 w-1/3 rounded-md bg-[#c9a96e]/20" />
                <div className="h-3 w-full rounded-md bg-[#c9a96e]/10" />
                <div className="h-3 w-5/6 rounded-md bg-[#c9a96e]/10" />
                <div className="mt-auto h-3 w-2/3 rounded-md bg-[#c9a96e]/10" />
              </div>

              {/* Bottom bar */}
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.04] p-5 md:col-span-3">
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-white/5" />
                  <div className="h-8 w-8 rounded-full bg-white/5" />
                  <div className="h-8 w-8 rounded-full bg-white/5" />
                </div>
                <div className="h-7 w-20 rounded-full bg-white/10" />
              </div>
            </div>

            {/* Bottom fade */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#111110] to-transparent" />
          </div>
        </div>
      </div>
    </section>
  );
}
