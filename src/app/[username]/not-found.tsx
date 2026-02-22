import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function UsernameNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">
        This username doesn&apos;t have a page yet.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Go home</Link>
      </Button>
    </main>
  );
}
