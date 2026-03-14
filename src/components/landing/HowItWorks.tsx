import { MessageSquare, Link2, Globe } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type StepProps = {
  number: number;
  icon: LucideIcon;
  title: string;
  description: string;
};

function Step({ number, icon: Icon, title, description }: StepProps) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* Numbered badge */}
      <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
        <Icon className="h-6 w-6 text-[#c9a96e]" />
        <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#c9a96e] text-xs font-bold text-[#111]">
          {number}
        </span>
      </div>
      <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
      <p className="max-w-xs text-sm leading-relaxed text-[#999]">
        {description}
      </p>
    </div>
  );
}

const steps: StepProps[] = [
  {
    number: 1,
    icon: MessageSquare,
    title: "Start a conversation",
    description:
      "Tell the AI about yourself — your work, passions, and story. It listens, asks smart follow-ups, and remembers everything.",
  },
  {
    number: 2,
    icon: Link2,
    title: "Connect your sources",
    description:
      "Link GitHub, Spotify, Strava, LinkedIn, or RSS feeds. Your page stays fresh with real data from your life.",
  },
  {
    number: 3,
    icon: Globe,
    title: "Publish your page",
    description:
      "One click and your living personal page is live on the web. Update it anytime by just talking.",
  },
];

export function HowItWorks() {
  return (
    <section className="px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-widest text-[#c9a96e]">
          How it works
        </h2>
        <p className="mx-auto mb-16 max-w-xl text-center text-2xl font-bold text-white sm:text-3xl">
          From conversation to published page in minutes
        </p>

        {/* Steps — vertical on mobile, horizontal on desktop */}
        <div className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
          {steps.map((step) => (
            <Step key={step.number} {...step} />
          ))}
        </div>
      </div>
    </section>
  );
}
