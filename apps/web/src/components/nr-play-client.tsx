"use client";

import type { HudState, NaijaRushGame, NrResult } from "@venix/game-3d";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipRecorder, clipFormat, type Clip } from "@venix/sharing/clip";
import { postJson } from "@/lib/client-events";
import { ShareSheet } from "./share-sheet";

type Phase = "intro" | "loading" | "countdown" | "playing" | "submitting" | "result" | "error" | "nowebgl";

interface ChallengeInfo {
  code: string;
  targetScore: number;
  displayName: string | null;
}

interface RunInfo {
  runId: string;
  token: string;
  seed: string;
  mode: string;
  challenge: ChallengeInfo | null;
}

interface FinishInfo {
  runId: string;
  status: "valid" | "flagged" | "rejected";
  score: number;
  reason?: string;
  personalBest: number;
  isNewBest: boolean;
  dailyRank: number | null;
  challenge: (ChallengeInfo & { outcome: "beaten" | "tied" | "lost" }) | null;
  stats: { distance?: number; coins?: number; nearMisses?: number; survived?: boolean; crashedInto?: string | null; seconds?: number } | null;
}

interface Props {
  campaign?: string | null;
  mode: "standard" | "daily" | "endless";
  challenge: ChallengeInfo | null;
  challengeError?: string | null;
  snapEnabled: boolean;
}

const CHARACTERS: { id: string; name: string; colors: string[]; product?: string }[] = [
  { id: "tunde", name: "Tunde", colors: ["#7BE000", "#FF2E4D", "#15101C"] },
  { id: "ada", name: "Ada", colors: ["#B44DFF", "#FF3D8B", "#FF7A00"] },
  { id: "zee", name: "Zee", colors: ["#00C2FF", "#00E0B0", "#B44DFF"] },
  { id: "ada_owambe", name: "Owambe Ada", colors: ["#FFD54A", "#FFC400", "#FFFFFF"], product: "skin_owambe_ada" },
  { id: "tunde_neon", name: "Neon Tunde", colors: ["#00E0B0", "#FF3D8B", "#7BE000"], product: "skin_neon_tunde" },
];

const CRASH_NAMES: Record<string, string> = {
  danfo: "a danfo",
  keke: "a keke",
  cart: "a food cart",
  pothole: "a pothole",
  puddle: "a flooded puddle",
  cones: "the roadworks cones",
  barrier: "a barrier",
  canopy: "a market canopy",
  banner: "a street banner",
};

const PREFS_KEY = "nr_prefs";
const GAME_NAME = "Naija Rush";

export function NrPlayClient({ mode: initialMode, challenge, challengeError, snapEnabled, campaign = null }: Props) {
  const [owned, setOwned] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<NaijaRushGame | null>(null);
  const moduleRef = useRef<Promise<typeof import("@venix/game-3d")> | null>(null);
  const pending = useRef<{ result: NrResult; run: RunInfo } | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [mode, setMode] = useState(initialMode);
  const [count, setCount] = useState(3);
  const [hud, setHud] = useState<HudState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FinishInfo | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [clip, setClip] = useState<Clip | null>(null);
  const [clipSupported, setClipSupported] = useState(false);
  const recorderRef = useRef<ClipRecorder | null>(null);
  const [activeChallenge, setActiveChallenge] = useState(challenge);
  const [prefs, setPrefs] = useState({ character: "tunde", muted: false, reducedMotion: false, buttons: false, lowQuality: false, recordClip: true });

  // Start downloading the 3D engine as soon as the intro shows.
  const loadModule = useCallback(() => (moduleRef.current ??= import("@venix/game-3d")), []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setPrefs((p) => ({ ...p, ...saved, reducedMotion: saved?.reducedMotion ?? reduced }));
    } catch {
      /* storage blocked */
    }
    loadModule()
      .then((m) => {
        if (!m.webglAvailable()) setPhase("nowebgl");
      })
      .catch(() => {});
    setClipSupported(clipFormat() !== null);
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { entitlements?: string[] } | null) => setOwned(me?.entitlements ?? []))
      .catch(() => {});
    return () => {
      gameRef.current?.destroy();
      recorderRef.current?.cancel();
    };
  }, [loadModule]);

  const updatePref = <K extends keyof typeof prefs>(key: K, value: (typeof prefs)[K]) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    if (key === "muted") gameRef.current?.setMuted(Boolean(value));
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const flash = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((t) => (t === text ? null : t)), 900);
  };

  const submit = useCallback(async (attempt = 0): Promise<void> => {
    const p = pending.current;
    if (!p) return;
    setPhase("submitting");
    try {
      const res = await postJson<FinishInfo>(`/api/runs/${p.run.runId}/finish`, { token: p.run.token, log: p.result.log, score: p.result.score });
      pending.current = null;
      setResult(res);
      setPhase("result");
    } catch (e) {
      const err = e as Error & { status?: number };
      if ((!err.status || err.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        return submit(attempt + 1);
      }
      setError(err.status ? err.message : "We could not reach the server. Check your connection and tap Retry.");
      setPhase("error");
    }
  }, []);

  const start = useCallback(
    async (opts: { rematch?: boolean } = {}) => {
      setError(null);
      setResult(null);
      setShareOpen(false);
      recorderRef.current?.cancel();
      recorderRef.current = null;
      setClip(null);
      setHud(null);
      setPhase("loading");
      try {
        const code = opts.rematch === false ? null : activeChallenge?.code ?? null;
        if (!code) setActiveChallenge(null);
        const [mod, run] = await Promise.all([
          loadModule(),
          postJson<RunInfo>("/api/runs", { game: "naija-rush", mode: code ? undefined : mode, challenge: code, campaign: code || mode === "endless" ? null : campaign }),
        ]);
        if (!mod.webglAvailable()) {
          setPhase("nowebgl");
          return;
        }
        if (run.challenge) setActiveChallenge(run.challenge);
        gameRef.current?.destroy();
        const game = new mod.NaijaRushGame(canvasRef.current!, {
          seed: run.seed,
          mode: run.mode === "endless" ? "endless" : "short",
          character: CHARACTERS.find((c) => c.id === prefs.character && (!c.product || owned.includes(c.product)))?.id ?? "tunde",
          muted: prefs.muted,
          reducedMotion: prefs.reducedMotion,
          quality: prefs.lowQuality ? "low" : "auto",
          onHud: setHud,
          onPauseChange: setPaused,
          onEvent: (e) => {
            if (e.type === "near_miss") flash("Close one! +10");
            else if (e.type === "power") flash(e.pickup.kind === "shield" ? "Shield up!" : "Coin magnet!");
            else if (e.type === "shield_break") flash("Shield saved you!");
          },
          onFinish: (r) => {
            pending.current = { result: r, run };
            void submit();
            const rec = recorderRef.current;
            if (rec) {
              void rec
                .finish({ score: r.score, gameName: "Naija Rush", headline: r.state.finished && !r.state.crashed ? "I survived Lagos with" : "I scored", host: window.location.host })
                .then((c) => recorderRef.current === rec && setClip(c));
            }
          },
        });
        gameRef.current = game;
        setPhase("countdown");
        for (let n = 3; n > 0; n--) {
          setCount(n);
          await new Promise((r) => setTimeout(r, 650));
        }
        setPhase("playing");
        game.start();
        // Clips for competitive runs only, and never in data saver mode.
        if (prefs.recordClip && !prefs.lowQuality && run.mode !== "endless" && clipFormat()) {
          const rec = new ClipRecorder(canvasRef.current!, clipFormat(), 64);
          if (rec.start()) recorderRef.current = rec;
        }
      } catch (e) {
        setError((e as Error).message || "Could not start the game.");
        setPhase("error");
      }
    },
    [activeChallenge, loadModule, mode, prefs, submit, owned, campaign],
  );

  const press = (a: "L" | "R" | "J" | "S") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    gameRef.current?.input(a);
  };

  const outcome = result?.challenge?.outcome;
  const rival = result?.challenge?.displayName ?? activeChallenge?.displayName ?? "your challenger";
  const isEndless = mode === "endless" && !activeChallenge;

  return (
    <div className="play-shell nr-shell">
      <canvas ref={canvasRef} className="play-canvas" aria-label="Naija Rush play area" role="img" />

      {phase === "playing" && hud && (
        <div className="nr-hud" aria-live="off">
          <div className="nr-pill nr-score">
            <span>Score</span>
            <b>{hud.score.toLocaleString("en-NG")}</b>
          </div>
          <div className="nr-pill nr-time">
            <span>{hud.remaining !== null ? "Time" : "Metres"}</span>
            <b>{hud.remaining !== null ? hud.remaining : hud.distance}</b>
          </div>
          <div className="nr-pill nr-coins">
            <span>Coins</span>
            <b>{hud.coins}</b>
          </div>
          {(hud.shield || hud.magnet) && (
            <div className="nr-powers">
              {hud.shield && <span className="nr-power shield">Shield</span>}
              {hud.magnet && <span className="nr-power magnet">Magnet</span>}
            </div>
          )}
        </div>
      )}
      {phase === "playing" && toast && <div className="nr-toast">{toast}</div>}

      {phase === "playing" && prefs.buttons && (
        <div className="nr-pad" aria-label="Controls">
          <button aria-label="Move left" onPointerDown={press("L")}>◀</button>
          <div className="nr-pad-mid">
            <button aria-label="Jump" onPointerDown={press("J")}>▲</button>
            <button aria-label="Slide" onPointerDown={press("S")}>▼</button>
          </div>
          <button aria-label="Move right" onPointerDown={press("R")}>▶</button>
        </div>
      )}

      <div className="play-toolbar">
        <button className="icon-btn" onClick={() => (paused ? gameRef.current?.resume() : gameRef.current?.pause())} disabled={phase !== "playing"} aria-pressed={paused}>
          {paused ? "Resume" : "Pause"}
        </button>
        <span className="fineprint" style={{ alignSelf: "center" }}>
          {activeChallenge ? `Target ${activeChallenge.targetScore.toLocaleString("en-NG")}` : isEndless ? "Endless" : mode === "daily" ? "Daily route" : "60 second rush"}
        </span>
        <button className="icon-btn" onClick={() => updatePref("muted", !prefs.muted)} aria-pressed={prefs.muted}>
          {prefs.muted ? "Sound off" : "Sound on"}
        </button>
      </div>

      {phase === "nowebgl" && (
        <div className="overlay">
          <div className="panel">
            <h2>3D is not available here</h2>
            <p>This browser or phone cannot run 3D graphics (WebGL). Try opening the link in Chrome or Safari, or turn off any battery saver and try again.</p>
            <Link className="btn btn-block btn-lg" href="/">
              Back home
            </Link>
          </div>
        </div>
      )}

      {phase === "intro" && (
        <div className="overlay">
          <div className="panel">
            {challengeError && <p className="notice">{challengeError}</p>}
            {activeChallenge ? (
              <>
                <span className="eyebrow">Challenge</span>
                <h2>
                  {activeChallenge.displayName
                    ? `Beat ${activeChallenge.displayName}’s ${activeChallenge.targetScore.toLocaleString("en-NG")}`
                    : `Beat ${activeChallenge.targetScore.toLocaleString("en-NG")}`}
                </h2>
                <p>Same street, same traffic, sixty seconds. Survive Lagos.</p>
              </>
            ) : (
              <>
                <span className="eyebrow">Naija Rush</span>
                <h2>Survive Lagos</h2>
                <div className="tabs" role="radiogroup" aria-label="Mode">
                  {(
                    [
                      ["standard", "60s rush"],
                      ["daily", "Daily route"],
                      ["endless", "Endless"],
                    ] as const
                  ).map(([m, label]) => (
                    <a key={m} href="#" role="radio" aria-checked={mode === m} aria-current={mode === m ? "page" : undefined} onClick={(e) => (e.preventDefault(), setMode(m))}>
                      {label}
                    </a>
                  ))}
                </div>
              </>
            )}
            <div className="nr-chars" role="radiogroup" aria-label="Runner">
              {CHARACTERS.map((c) => {
                const locked = Boolean(c.product && !owned.includes(c.product));
                return (
                <button
                  key={c.id}
                  role="radio"
                  aria-checked={prefs.character === c.id}
                  aria-disabled={locked}
                  className={`nr-char${prefs.character === c.id ? " on" : ""}${locked ? " locked" : ""}`}
                  onClick={() => (locked ? (window.location.href = "/premium") : updatePref("character", c.id))}
                >
                  <span className="nr-swatch" aria-hidden="true">
                    {c.colors.map((col) => (
                      <i key={col} style={{ background: col }} />
                    ))}
                  </span>
                  {c.name}
                  {locked && <small className="nr-lock">Premium</small>}
                </button>
                );
              })}
            </div>
            <p className="fineprint" style={{ margin: "4px 0 10px" }}>Every runner moves exactly the same. Pick your style.</p>
            <ul className="legend" aria-label="How to play">
              <li><span className="dot" style={{ background: "#00C2FF", color: "#1B0B3A" }}>⇆</span>Swipe left or right to change lane</li>
              <li><span className="dot" style={{ background: "#7BE000", color: "#1B0B3A" }}>▲</span>Swipe up to jump potholes, puddles and cones</li>
              <li><span className="dot" style={{ background: "#FF3D8B", color: "#fff" }}>▼</span>Swipe down to slide under canopies and banners</li>
              <li><span className="dot" style={{ background: "#FFC400", color: "#1B0B3A" }}>₦</span>Grab coins; shields and magnets help</li>
            </ul>
            <div className="toggles">
              <label className="toggle"><input type="checkbox" checked={prefs.buttons} onChange={(e) => updatePref("buttons", e.target.checked)} /> On screen buttons</label>
              <label className="toggle"><input type="checkbox" checked={prefs.reducedMotion} onChange={(e) => updatePref("reducedMotion", e.target.checked)} /> Reduce motion</label>
              <label className="toggle"><input type="checkbox" checked={prefs.lowQuality} onChange={(e) => updatePref("lowQuality", e.target.checked)} /> Data and battery saver</label>
              {clipSupported && (
                <label className="toggle">
                  <input type="checkbox" checked={prefs.recordClip} onChange={(e) => updatePref("recordClip", e.target.checked)} /> Make a video clip (stays on your phone)
                </label>
              )}
            </div>
            <button className="btn btn-block btn-lg" onClick={() => start()}>
              {activeChallenge ? "Beat this score" : "Run!"}
            </button>
            <p className="fineprint" style={{ marginBottom: 0 }}>Keyboard: arrows or WASD, Space to jump, P to pause.</p>
          </div>
        </div>
      )}

      {phase === "loading" && (
        <div className="overlay" aria-live="polite">
          <div className="panel" style={{ textAlign: "center" }}>
            <h2>Loading Lagos…</h2>
            <p>First time only. The whole street is about 200 KB.</p>
          </div>
        </div>
      )}

      {phase === "countdown" && (
        <div className="overlay overlay-clear" aria-live="assertive">
          <div className="countdown">{count}</div>
        </div>
      )}

      {phase === "playing" && paused && (
        <div className="overlay">
          <div className="panel">
            <h2>Paused</h2>
            <p>Traffic waits for you. For once.</p>
            <button className="btn btn-block btn-lg" onClick={() => gameRef.current?.resume()}>
              Resume
            </button>
          </div>
        </div>
      )}

      {phase === "submitting" && (
        <div className="overlay" aria-live="polite">
          <div className="panel">
            <h2>Checking your run…</h2>
            <p>Our server replays every swipe to keep the boards fair.</p>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="overlay">
          <div className="panel">
            <h2>Hmm.</h2>
            <p className="error">{error}</p>
            <div className="stack">
              {pending.current && (
                <button className="btn btn-block" onClick={() => submit()}>
                  Retry sending my score
                </button>
              )}
              <button className="btn btn-block btn-ghost" onClick={() => start({ rematch: false })}>
                Run again
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "result" && result && (
        <div className="overlay">
          <div className="panel" aria-live="polite">
            {outcome && (
              <div className={`verdict ${outcome === "beaten" ? "win" : outcome === "lost" ? "lose" : ""}`}>
                {outcome === "beaten" ? `You beat ${rival}!` : outcome === "tied" ? `Dead level with ${rival}.` : `${rival} still leads.`}
              </div>
            )}
            <div className="fineprint">
              {result.stats?.survived ? "You survived Lagos!" : result.stats?.crashedInto ? `Stopped by ${CRASH_NAMES[result.stats.crashedInto] ?? "traffic"}` : "Run over"}
            </div>
            <div className="result-score">{result.score.toLocaleString("en-NG")}</div>
            {result.challenge && <div className="fineprint">Target was {result.challenge.targetScore.toLocaleString("en-NG")}</div>}
            {result.status === "flagged" && <p className="notice">This run is being reviewed before it can appear on the rankings or be shared.</p>}
            {result.status === "rejected" && <p className="notice">We could not verify this run ({result.reason?.replace(/_/g, " ")}). Try another.</p>}
            {result.stats && (
              <div className="statgrid">
                <div className="stat"><b>{result.stats.distance ?? 0}m</b><span>Distance</span></div>
                <div className="stat"><b>{result.stats.coins ?? 0}</b><span>Coins</span></div>
                <div className="stat"><b>{result.dailyRank ? `#${result.dailyRank}` : result.stats.nearMisses ?? 0}</b><span>{result.dailyRank ? "Today" : "Near misses"}</span></div>
              </div>
            )}
            <p className="fineprint">{result.isNewBest ? "New personal best!" : `Personal best ${result.personalBest.toLocaleString("en-NG")}`}</p>
            <div className="stack">
              {result.status === "valid" && !isEndless && (
                <button className="btn btn-block btn-lg btn-green" onClick={() => setShareOpen(true)}>
                  {outcome === "beaten" ? "Send it back to them" : "Challenge a friend"}
                </button>
              )}
              <div className="row">
                {activeChallenge && outcome !== "beaten" ? (
                  <button className="btn" onClick={() => start()}>
                    Rematch
                  </button>
                ) : null}
                <button className="btn btn-ghost" onClick={() => start({ rematch: false })}>
                  Run again
                </button>
              </div>
              <Link className="btn btn-ghost btn-block" href="/leaderboards">
                Rankings
              </Link>
            </div>
          </div>
        </div>
      )}

      {shareOpen && result && (
        <ShareSheet runId={result.runId} score={result.score} gameName={GAME_NAME} gameSlug="naija-rush" onClose={() => setShareOpen(false)} snapEnabled={snapEnabled} clip={clip} />
      )}
    </div>
  );
}
