import { ChevronDown } from "lucide-react";

const faqs = [
  {
    q: "What is OpenSelf?",
    a: "OpenSelf is an AI-powered personal page builder. You have a short conversation with an AI agent, connect your existing accounts, and get a living personal page that stays up to date automatically.",
  },
  {
    q: "Is it free?",
    a: "OpenSelf is free during the public beta. We plan to offer a generous free tier and optional paid plans for power users with custom domains and advanced features.",
  },
  {
    q: "Where is my data stored?",
    a: "Your data is stored in a local-first SQLite database — one file per identity. You own your data completely. OpenSelf is open source under AGPL-3.0, so you can always self-host.",
  },
  {
    q: "Can I use my own domain?",
    a: "Custom domains are on the roadmap. For now, your page lives at openself.dev/yourname. We will notify beta users when custom domains become available.",
  },
  {
    q: "Which AI models do you use?",
    a: "OpenSelf is model-agnostic. It supports OpenAI, Anthropic, and Google models through the Vercel AI SDK. You can bring your own API key or use the default configuration.",
  },
  {
    q: "How do I delete my account?",
    a: "You can delete your account and all associated data at any time from the builder settings. Since your data lives in a single SQLite file, deletion is immediate and complete.",
  },
];

export function FAQ() {
  return (
    <section className="px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-widest text-[#c9a96e]">
          FAQ
        </h2>
        <p className="mx-auto mb-12 max-w-xl text-center text-2xl font-bold text-white sm:text-3xl">
          Frequently asked questions
        </p>

        <div className="border-t border-white/8">
          {faqs.map((faq) => (
            <details key={faq.q} className="group border-b border-white/8">
              <summary className="flex w-full cursor-pointer list-none items-center justify-between py-5 text-left">
                <span className="pr-4 text-base font-medium text-white">
                  {faq.q}
                </span>
                <ChevronDown className="h-5 w-5 shrink-0 text-[#999] transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="pb-5 text-sm leading-relaxed text-[#999]">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
