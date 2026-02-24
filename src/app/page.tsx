import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-5xl font-bold tracking-tight">OpenSelf</h1>
      <p className="max-w-md text-center text-lg text-muted-foreground">
        Talk for 5 minutes. Get a living personal page.
      </p>
      <Button asChild size="lg">
        <Link href="/builder">Create your page</Link>
      </Button>
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
