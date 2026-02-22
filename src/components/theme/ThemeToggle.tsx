"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  theme: string;
  colorScheme: "light" | "dark";
  onThemeChange: (theme: string) => void;
  onColorSchemeChange: (colorScheme: "light" | "dark") => void;
};

export function ThemeToggle({
  theme,
  colorScheme,
  onThemeChange,
  onColorSchemeChange,
}: ThemeToggleProps) {
  return (
    <div className="absolute bottom-4 right-4 z-10 flex gap-1 rounded-full border bg-background/80 p-1 shadow-sm backdrop-blur-sm">
      <Button
        variant={theme === "minimal" ? "default" : "ghost"}
        size="xs"
        className={cn("rounded-full")}
        onClick={() => onThemeChange("minimal")}
      >
        Minimal
      </Button>
      <Button
        variant={theme === "warm" ? "default" : "ghost"}
        size="xs"
        className={cn("rounded-full")}
        onClick={() => onThemeChange("warm")}
      >
        Warm
      </Button>
      <div className="mx-1 w-px bg-border" />
      <Button
        variant={colorScheme === "light" ? "default" : "ghost"}
        size="xs"
        className={cn("rounded-full")}
        onClick={() => onColorSchemeChange("light")}
      >
        Light
      </Button>
      <Button
        variant={colorScheme === "dark" ? "default" : "ghost"}
        size="xs"
        className={cn("rounded-full")}
        onClick={() => onColorSchemeChange("dark")}
      >
        Dark
      </Button>
    </div>
  );
}
