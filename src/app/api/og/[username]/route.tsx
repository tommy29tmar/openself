import { readFileSync } from "node:fs";
import { join } from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { getPublishedPage } from "@/lib/services/page-service";

export const runtime = "nodejs";

// Cache font data at module level (loaded once per cold start)
let interBold: ArrayBuffer | null = null;
let interRegular: ArrayBuffer | null = null;

function loadFont(filename: string): ArrayBuffer | null {
  try {
    const buf = readFileSync(join(process.cwd(), "public", "fonts", filename));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch {
    return null;
  }
}

function getFonts(): { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[] {
  if (!interBold) interBold = loadFont("Inter-Bold.ttf");
  if (!interRegular) interRegular = loadFont("Inter-Regular.ttf");

  const fonts: { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[] = [];
  if (interRegular) fonts.push({ name: "Inter", data: interRegular, weight: 400, style: "normal" });
  if (interBold) fonts.push({ name: "Inter", data: interBold, weight: 700, style: "normal" });

  return fonts;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const config = getPublishedPage(username);

  if (!config) {
    return new Response("Not found", { status: 404 });
  }

  const hero = config.sections.find((s) => s.type === "hero");
  const bio = config.sections.find((s) => s.type === "bio");
  const name = typeof hero?.content?.name === "string" ? hero.content.name : username;
  const headline = typeof hero?.content?.tagline === "string" ? hero.content.tagline : "";
  const snippet = typeof bio?.content?.text === "string" ? bio.content.text.slice(0, 120) : "";

  const fonts = getFonts();
  if (fonts.length === 0) {
    return new Response("Font not available", { status: 500 });
  }

  const svg = await satori(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        backgroundColor: "#111113",
        color: "#f5f5f5",
        padding: "60px 80px",
        fontFamily: "Inter",
      }}
    >
      {/* Top: branding */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div
          style={{
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            backgroundColor: "#a78bfa",
          }}
        />
        <span style={{ fontSize: "24px", fontWeight: 400, color: "#a1a1aa" }}>
          openself.dev
        </span>
      </div>

      {/* Center: name + headline + snippet */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div
          style={{
            fontSize: "64px",
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: "#ffffff",
          }}
        >
          {name}
        </div>
        {headline && (
          <div
            style={{
              fontSize: "28px",
              fontWeight: 400,
              color: "#a78bfa",
              lineHeight: 1.3,
            }}
          >
            {headline.length > 80 ? headline.slice(0, 77) + "..." : headline}
          </div>
        )}
        {snippet && (
          <div
            style={{
              fontSize: "20px",
              fontWeight: 400,
              color: "#a1a1aa",
              lineHeight: 1.4,
              maxWidth: "800px",
            }}
          >
            {snippet.length > 120 ? snippet.slice(0, 117) + "..." : snippet}
          </div>
        )}
      </div>

      {/* Bottom: URL */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          fontSize: "22px",
          fontWeight: 400,
          color: "#71717a",
        }}
      >
        openself.dev/{username}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts,
    },
  );

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return new Response(new Uint8Array(pngBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
