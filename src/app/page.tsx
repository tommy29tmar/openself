import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-background overflow-hidden selection:bg-primary selection:text-primary-foreground">
      {/* Refined Background Gradients */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-50 dark:opacity-30">
        <div className="absolute top-0 -left-10 h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-[120px] mix-blend-multiply dark:mix-blend-screen" />
        <div className="absolute top-40 right-[-10%] h-[400px] w-[400px] rounded-full bg-purple-500/10 blur-[120px] mix-blend-multiply dark:mix-blend-screen" />
        <div className="absolute -bottom-20 left-1/2 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-primary/5 blur-[150px]" />
      </div>

      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/60 backdrop-blur-xl transition-all">
        <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tighter">OpenSelf</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Sign in
            </Link>
            <Button asChild variant="default" size="sm" className="rounded-full px-5 shadow-md">
              <Link href="/builder">Get Started</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto max-w-6xl px-6 pt-24 pb-32 sm:pt-32 sm:pb-40 lg:pt-40 lg:pb-48">
        <div className="flex flex-col items-center text-center space-y-12 relative z-10">
          
          {/* Premium Badge */}
          <div className="inline-flex items-center rounded-full border border-border/50 bg-background/50 px-4 py-1.5 text-sm font-medium text-muted-foreground backdrop-blur-md shadow-sm transition-colors hover:bg-muted/50 hover:text-foreground">
            <span className="relative flex h-2 w-2 mr-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Reimagine your digital identity
          </div>

          {/* Typography & Copy */}
          <div className="space-y-6 max-w-4xl">
            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter text-balance">
              Talk for 5 minutes. <br className="hidden sm:inline"/>
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/50">
                Get a living personal page.
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg sm:text-xl text-muted-foreground leading-relaxed text-balance font-medium">
              Effortlessly translate your thoughts, experiences, and identity into a beautifully curated, living digital presence. No coding required.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
            <Button asChild size="lg" className="rounded-full h-12 px-8 text-base shadow-xl shadow-primary/10 transition-all hover:scale-105 hover:shadow-primary/20 active:scale-95">
              <Link href="/builder">Create your page</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full h-12 px-8 text-base bg-background/50 backdrop-blur-sm border-border/50 hover:bg-muted/50 transition-colors">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
          
          {/* Functional Preview Mockup */}
          <div className="w-full max-w-5xl mt-24 relative rounded-2xl sm:rounded-[2rem] border border-border/40 bg-background/40 backdrop-blur-2xl shadow-2xl overflow-hidden ring-1 ring-white/10 group">
            
            {/* Window Header */}
            <div className="h-12 border-b border-border/40 flex items-center px-5 gap-1.5 bg-muted/20">
              <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] shadow-sm border border-black/10" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] shadow-sm border border-black/10" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f] shadow-sm border border-black/10" />
            </div>

            {/* Window Content */}
            <div className="aspect-[16/9] w-full bg-gradient-to-br from-muted/30 via-background to-muted/20 relative p-6 sm:p-10 md:p-16">
               
               {/* Decorative Grid */}
               <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
               
               {/* Bento Grid Mockup */}
               <div className="h-full w-full max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-1000">
                  
                  {/* Main Profile Card */}
                  <div className="md:col-span-2 row-span-2 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-8 shadow-sm flex flex-col justify-end transition-all duration-500 hover:bg-card/80">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-primary/20 to-primary/5 mb-6 ring-1 ring-border/50 shadow-inner" />
                    <div className="space-y-3">
                      <div className="h-8 w-3/4 bg-foreground/10 rounded-lg" />
                      <div className="h-4 w-1/2 bg-foreground/5 rounded-md" />
                      <div className="h-4 w-5/6 bg-foreground/5 rounded-md" />
                    </div>
                  </div>

                  {/* Side Cards */}
                  <div className="rounded-2xl border border-border/50 bg-card/30 backdrop-blur-sm p-6 shadow-sm transition-all duration-500 hover:bg-card/50">
                    <div className="h-full w-full rounded-xl bg-foreground/5" />
                  </div>
                  
                  <div className="rounded-2xl border border-border/50 bg-primary/5 backdrop-blur-sm p-6 shadow-sm flex flex-col gap-3 transition-all duration-500 hover:bg-primary/10">
                    <div className="h-4 w-1/3 bg-primary/20 rounded-md" />
                    <div className="h-4 w-full bg-primary/10 rounded-md" />
                    <div className="h-4 w-5/6 bg-primary/10 rounded-md" />
                    <div className="h-4 w-2/3 bg-primary/10 rounded-md mt-auto" />
                  </div>

                  {/* Bottom Strip */}
                  <div className="md:col-span-3 rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-6 shadow-sm flex items-center justify-between transition-all duration-500 hover:bg-card/60">
                    <div className="flex gap-4 items-center">
                      <div className="h-10 w-10 rounded-full bg-foreground/5" />
                      <div className="h-10 w-10 rounded-full bg-foreground/5" />
                      <div className="h-10 w-10 rounded-full bg-foreground/5" />
                    </div>
                    <div className="h-8 w-24 bg-foreground/10 rounded-full" />
                  </div>

               </div>

               {/* Subtle overlay gradient to mask the bottom edge slightly */}
               <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
