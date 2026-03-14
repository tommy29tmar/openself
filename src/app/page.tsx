import Link from "next/link";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Features } from "@/components/landing/Features";
import { LiveExample } from "@/components/landing/LiveExample";
import { Testimonials } from "@/components/landing/Testimonials";
import { FAQ } from "@/components/landing/FAQ";
import { Footer } from "@/components/landing/Footer";

export const dynamic = "force-static";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#111113] text-white selection:bg-[#c9a96e] selection:text-[#111]">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#111113]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-white"
          >
            OpenSelf
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-[#999] transition-colors hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/builder"
              className="inline-flex h-8 items-center rounded-full bg-white px-4 text-sm font-medium text-[#111] transition-colors hover:bg-white/90"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <HeroSection />
        <HowItWorks />
        <Features />
        <LiveExample />
        <Testimonials />
        <FAQ />
      </main>

      <Footer />
    </div>
  );
}
