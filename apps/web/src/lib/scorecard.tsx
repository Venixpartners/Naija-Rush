import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PublicChallenge } from "./services/challenges";

export type CardFormat = "story" | "square" | "og";

export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  og: { width: 1200, height: 630 },
};

let fontCache: Promise<{ name: string; data: Buffer; weight: 700 | 800; style: "normal" }[]> | null = null;

export function cardFonts() {
  fontCache ??= (async () => {
    const dir = path.join(process.cwd(), "node_modules/@fontsource/bricolage-grotesque/files");
    const [w800, w700] = await Promise.all([
      readFile(path.join(dir, "bricolage-grotesque-latin-800-normal.woff")),
      readFile(path.join(dir, "bricolage-grotesque-latin-700-normal.woff")),
    ]);
    return [
      { name: "Bricolage", data: w800, weight: 800 as const, style: "normal" as const },
      { name: "Bricolage", data: w700, weight: 700 as const, style: "normal" as const },
    ];
  })();
  return fontCache;
}

const C = {
  ink: "#1B0B3A",
  yellow: "#FFC400",
  cream: "#FFFFFF",
  green: "#00E0B0",
  red: "#FF3D8B",
  blue: "#00C2FF",
  orange: "#FF7A00",
  lime: "#7BE000",
  purple: "#B44DFF",
  bomb: "#16091F",
  dim: "rgba(255,255,255,0.8)",
};

/** Danfo stripe band: the recurring brand motif. */
function Stripes({ height }: { height: number }) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height,
        backgroundImage: `repeating-linear-gradient(-45deg, ${C.yellow} 0px, ${C.yellow} 28px, #15101C 28px, #15101C 56px)`,
      }}
    />
  );
}

/** A little danfo for Naija Rush cards. */
function DanfoCluster({ unit }: { unit: number }) {
  const u = unit;
  const win = (left: number) => <div style={{ position: "absolute", left: u * left, top: u * 1.2, width: u * 1.6, height: u * 1.2, borderRadius: u * 0.2, background: "#2B3A67", display: "flex" }} />;
  return (
    <div style={{ display: "flex", position: "relative", width: u * 10, height: u * 7 }}>
      <div style={{ position: "absolute", left: 0, top: u * 0.6, width: u * 10, height: u * 4.6, borderRadius: u * 0.8, background: C.yellow, border: `${u * 0.25}px solid #FFFFFF`, display: "flex" }} />
      <div style={{ position: "absolute", left: u * 0.2, top: u * 3.2, width: u * 9.6, height: u * 0.45, background: "#15101C", display: "flex" }} />
      <div style={{ position: "absolute", left: u * 0.2, top: u * 4.1, width: u * 9.6, height: u * 0.3, background: "#15101C", display: "flex" }} />
      {win(0.8)}
      {win(3.0)}
      {win(5.2)}
      {win(7.4)}
      <div style={{ position: "absolute", left: u * 1.3, top: u * 4.6, width: u * 2, height: u * 2, borderRadius: 999, background: "#15101C", border: `${u * 0.3}px solid ${C.cream}`, display: "flex" }} />
      <div style={{ position: "absolute", left: u * 6.7, top: u * 4.6, width: u * 2, height: u * 2, borderRadius: 999, background: "#15101C", border: `${u * 0.3}px solid ${C.cream}`, display: "flex" }} />
    </div>
  );
}

/**
 * Public score card. Shows only the game, score and (if the player opted in)
 * their nickname. No device, location or account data is ever drawn.
 */
export function Scorecard({ challenge, format, host }: { challenge: PublicChallenge; format: CardFormat; host: string }) {
  const { width, height } = CARD_SIZES[format];
  const tall = format === "story";
  const og = format === "og";
  const scoreSize = og ? 190 : tall ? 330 : 250;
  const who = challenge.displayName ? challenge.displayName : "A Venix player";

  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        backgroundImage: "linear-gradient(180deg, #5B2BFF 0%, #FF3D8B 60%, #FF9A3D 100%)",
        color: C.cream,
        fontFamily: "Bricolage",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", position: "absolute", right: og ? 70 : tall ? 80 : 70, top: og ? 140 : tall ? 260 : 150 }}>
        <DanfoCluster unit={og ? 36 : tall ? 40 : 30} />
      </div>
      <Stripes height={og ? 22 : 36} />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: og ? "40px 64px" : tall ? "110px 90px" : "70px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: og ? 56 : 72, height: og ? 38 : 48, background: C.yellow, borderRadius: 8 }}>
            <div style={{ display: "flex", height: og ? 6 : 8, background: "#15101C" }} />
          </div>
          <div style={{ fontSize: og ? 40 : 50, fontWeight: 800, letterSpacing: 2 }}>NAIJA RUSH</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: og ? 38 : tall ? 58 : 48, fontWeight: 700, color: C.dim }}>{`${who} scored`}</div>
          <div style={{ fontSize: scoreSize, fontWeight: 800, lineHeight: 1, color: C.yellow, letterSpacing: -6, textShadow: `${og ? 6 : 10}px ${og ? 6 : 10}px 0 ${C.red}, ${og ? 12 : 20}px ${og ? 12 : 20}px 0 ${C.blue}` }}>
            {challenge.targetScore.toLocaleString("en-NG")}
          </div>
          <div style={{ fontSize: og ? 44 : tall ? 64 : 54, fontWeight: 800, marginTop: og ? 6 : 18 }}>{`on ${challenge.gameName}`}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: og ? 10 : 22 }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              backgroundImage: `linear-gradient(90deg, ${C.yellow}, ${C.orange})`,
              color: C.ink,
              fontSize: og ? 44 : tall ? 70 : 58,
              fontWeight: 800,
              padding: og ? "10px 28px" : "18px 40px",
              borderRadius: 18,
            }}
          >
            Can you beat it?
          </div>
          <div style={{ fontSize: og ? 28 : tall ? 42 : 36, fontWeight: 700, color: C.dim }}>
            {`${host}/c/${challenge.code}`}
          </div>
        </div>
      </div>
      <Stripes height={og ? 22 : 36} />
    </div>
  );
}
