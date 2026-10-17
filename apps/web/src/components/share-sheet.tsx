"use client";

import { CHANNEL_GUIDES, challengeUrl, shareText, whatsappUrl, type ShareChannel } from "@venix/sharing";
import type { Clip } from "@venix/sharing/clip";
import { useCallback, useEffect, useRef, useState } from "react";
import { copyText, postJson, sendEvent } from "@/lib/client-events";
import { IconCamera, IconChat, IconDownload, IconGhost, IconLink, IconNote, IconShare } from "./share-icons";

interface CreatedChallenge {
  code: string;
  url: string;
  targetScore: number;
  displayName: string | null;
}

interface Props {
  runId: string;
  score: number;
  gameName: string;
  gameSlug: string;
  onClose: () => void;
  snapEnabled?: boolean;
  /** Vertical highlight clip recorded on this device, if any. */
  clip?: Clip | null;
}

declare global {
  interface Window {
    snap?: { creativekit?: { initalizeShareButtons?: (els: HTMLCollectionOf<Element>) => void } };
  }
}

const NICK_KEY = "vc_nickname";

/**
 * ShareChallenge sheet. Creates (or reuses) the challenge for this run, then
 * offers every channel. Each button prepares content and hands off to the
 * player; nothing is ever posted automatically, and nothing here claims a
 * post was published.
 */
export function ShareSheet({ runId, score, gameName, gameSlug, onClose, snapEnabled = true, clip = null }: Props) {
  const [challenge, setChallenge] = useState<CreatedChallenge | null>(null);
  const [nickname, setNickname] = useState("");
  const [showNick, setShowNick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [guide, setGuide] = useState<keyof typeof CHANNEL_GUIDES | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [snapReady, setSnapReady] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [canShareVideo, setCanShareVideo] = useState(false);

  useEffect(() => {
    if (!clip) return;
    const url = URL.createObjectURL(clip.blob);
    setVideoUrl(url);
    try {
      const f = new File([clip.blob], `clip.${clip.ext}`, { type: clip.mime });
      setCanShareVideo(Boolean(navigator.canShare?.({ files: [f] })));
    } catch {
      setCanShareVideo(false);
    }
    return () => URL.revokeObjectURL(url);
  }, [clip]);
  const storyBlob = useRef<Blob | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(NICK_KEY);
      if (saved) {
        setNickname(saved);
        setShowNick(true);
      }
    } catch {
      /* storage may be blocked */
    }
    sendEvent("share_sheet_opened", { game: gameSlug });
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gameSlug, onClose]);

  const flash = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 2200);
  };

  const ctxFor = useCallback(
    (c: CreatedChallenge) => ({ baseUrl: new URL(c.url).origin, code: c.code, gameName, score: c.targetScore, displayName: c.displayName }),
    [gameName],
  );

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const c = await postJson<CreatedChallenge>("/api/challenges", { runId, nickname: nickname.trim(), showNickname: showNick && nickname.trim().length > 0 });
      setChallenge(c);
      setMessage(shareText(ctxFor(c), "whatsapp"));
      try {
        if (showNick && nickname.trim()) localStorage.setItem(NICK_KEY, nickname.trim());
        else localStorage.removeItem(NICK_KEY);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Prefetch the story card once the link exists so native share keeps the
  // user gesture (iOS drops it if we fetch after the tap).
  useEffect(() => {
    if (!challenge) return;
    let cancelled = false;
    fetch(`/api/scorecard/${challenge.code}?format=story`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        storyBlob.current = blob;
        const file = new File([blob], `venix-clash-${challenge.code}.png`, { type: "image/png" });
        setCanShareFiles(Boolean(navigator.canShare?.({ files: [file] })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [challenge]);

  // Snapchat Creative Kit for Web: no app registration required. The SDK
  // turns the placeholder div into a share button that opens Snapchat.
  useEffect(() => {
    if (!challenge || !snapEnabled) return;
    const init = () => {
      setSnapReady(true);
      // Wait a frame so the placeholder div is in the DOM before the SDK scans for it.
      requestAnimationFrame(() => window.snap?.creativekit?.initalizeShareButtons?.(document.getElementsByClassName("snapchat-creative-kit-share")));
    };
    if (document.getElementById("snapkit-sdk")) {
      init();
      return;
    }
    const script = document.createElement("script");
    script.id = "snapkit-sdk";
    script.src = "https://sdk.snapkit.com/js/v1/create.js";
    script.async = true;
    script.onload = init;
    document.body.appendChild(script);
  }, [challenge, snapEnabled]);

  if (!challenge) {
    return (
      <Backdrop onClose={onClose} innerRef={dialogRef} title="Challenge a friend">
        <p className="fineprint" style={{ marginTop: 0 }}>
          We will make a link and a story card for your score of <b>{score.toLocaleString("en-NG")}</b>. Whoever opens it plays the exact same round.
        </p>
        <label className="toggle" style={{ marginBottom: 10 }}>
          <input type="checkbox" checked={showNick} onChange={(e) => setShowNick(e.target.checked)} />
          Show a nickname on my challenge
        </label>
        {showNick && (
          <div className="field">
            <label htmlFor="nick">Nickname (public)</label>
            <input
              id="nick"
              className="input"
              maxLength={20}
              autoComplete="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Tolu from Yaba"
            />
            <span className="fineprint">Anyone with the link will see this. Leave it off to stay anonymous.</span>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn btn-block btn-lg" onClick={create} disabled={busy}>
          {busy ? "Making your link…" : "Make my challenge link"}
        </button>
      </Backdrop>
    );
  }

  const ctx = ctxFor(challenge);
  const linkFor = (ch: ShareChannel) => challengeUrl(ctx, ch);
  const storyUrl = `/api/scorecard/${challenge.code}?format=story`;

  const selected = (channel: ShareChannel) => sendEvent("share_target_selected", { channel, challenge: challenge.code, game: gameSlug });
  const handedOff = (channel: ShareChannel) => sendEvent("share_handoff_attempted", { channel, challenge: challenge.code, game: gameSlug });

  async function shareFile(channel: ShareChannel, text: string): Promise<boolean> {
    // Prefer the video: it is what TikTok, Reels and Snapchat reward.
    if (clip && canShareVideo) {
      try {
        const file = new File([clip.blob], `venix-clash-${challenge!.code}.${clip.ext}`, { type: clip.mime });
        await navigator.share({ files: [file], text });
        handedOff(channel);
        return true;
      } catch (e) {
        if ((e as Error).name === "AbortError") return true;
      }
    }
    const blob = storyBlob.current;
    if (!blob || !canShareFiles) return false;
    try {
      const file = new File([blob], `venix-clash-${challenge!.code}.png`, { type: "image/png" });
      await navigator.share({ files: [file], text });
      handedOff(channel);
      return true;
    } catch (e) {
      // AbortError means the player closed the sheet; that is fine.
      return (e as Error).name === "AbortError";
    }
  }

  function saveVideo(channel: ShareChannel) {
    if (!clip || !videoUrl) return false;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `venix-clash-${challenge!.code}.${clip.ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    handedOff(channel);
    return true;
  }

  function download(channel: ShareChannel) {
    if (channel !== "copy" && saveVideo(channel)) return;
    const a = document.createElement("a");
    a.href = `${storyUrl}&download=1`;
    a.download = `venix-clash-${challenge!.code}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    handedOff(channel);
  }

  const onWhatsApp = () => {
    selected("whatsapp");
    // Keep the player's edits but make sure the attributed link is present.
    const base = challengeUrl(ctx);
    const text = message.includes(base) ? message.replace(/\/c\/\w+(\?s=\w+)?/, `/c/${challenge.code}?s=wa`) : `${message}\n${linkFor("whatsapp")}`;
    handedOff("whatsapp");
    window.open(whatsappUrl(text), "_blank", "noopener");
  };

  const onVisual = async (channel: "instagram" | "tiktok") => {
    selected(channel);
    const text = shareText(ctx, channel);
    const copied = await copyText(channel === "tiktok" ? text : linkFor(channel));
    setGuide(channel);
    if (copied) flash(channel === "tiktok" ? "Caption and link copied" : "Link copied for your link sticker");
    if (!(await shareFile(channel, text))) download(channel);
  };

  const onNative = async () => {
    selected("native");
    const url = linkFor("native");
    const text = shareText(ctx, "native").replace(/\n.*$/, "");
    if (await shareFile("native", `${text}\n${url}`)) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Beat my ${gameName} score`, text, url });
        handedOff("native");
      } catch {
        /* dismissed */
      }
    } else {
      await copyText(`${text}\n${url}`);
      handedOff("native");
      flash("Copied. Paste it anywhere.");
    }
  };

  const onCopy = async () => {
    selected("copy");
    if (await copyText(linkFor("copy"))) {
      handedOff("copy");
      flash("Link copied");
    }
  };

  return (
    <Backdrop onClose={onClose} innerRef={dialogRef} title="Send your challenge">
      <div className="row" style={{ alignItems: "center", gap: 14 }}>
        {videoUrl ? (
          <video className="card-preview" src={videoUrl} muted loop autoPlay playsInline aria-label="Your highlight clip" width={120} height={213} style={{ flex: "none", objectFit: "cover" }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="card-preview" src={storyUrl} alt={`Story card showing a score of ${challenge.targetScore}`} width={120} height={213} style={{ flex: "none" }} />
        )}
        <div style={{ flex: 1 }}>
          <div className="fineprint">Your link</div>
          <div style={{ fontWeight: 700, wordBreak: "break-all" }}>{challenge.url}</div>
        </div>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="msg">Message (edit before sending)</label>
        <textarea id="msg" className="input" value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>

      <div className="share-grid">
        <button className="share-btn" onClick={onWhatsApp}>
          <IconChat /> WhatsApp
        </button>
        <button className="share-btn" onClick={() => onVisual("instagram")}>
          <IconCamera /> Instagram
        </button>
        <button className="share-btn" onClick={() => onVisual("tiktok")}>
          <IconNote /> TikTok
        </button>
        <button
          className="share-btn"
          onClick={async () => {
            selected("snapchat");
            setGuide("snapchat");
            await copyText(linkFor("snapchat"));
            if (!(await shareFile("snapchat", shareText(ctx, "snapchat")))) download("snapchat");
          }}
        >
          <IconGhost /> Snapchat
        </button>
        <button className="share-btn" onClick={onNative}>
          <IconShare /> More apps
        </button>
        <button className="share-btn" onClick={onCopy}>
          <IconLink /> Copy link
        </button>
      </div>

      {snapEnabled && snapReady && (
        <div
          style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}
          onClickCapture={() => {
            selected("snapchat");
            handedOff("snapchat");
          }}
        >
          <span className="fineprint">Send straight to Snapchat:</span>
          <div className="snapchat-creative-kit-share" data-share-url={linkFor("snapchat")} data-theme="dark" data-size="small" data-text="true" />
        </div>
      )}

      {clip && (
        <button className="share-btn" style={{ justifyContent: "center", width: "100%", marginBottom: 10 }} onClick={() => { selected("copy"); saveVideo("copy"); flash("Video saved"); }}>
          <IconDownload /> Save video ({clip.seconds.toFixed(0)}s {clip.ext.toUpperCase()})
        </button>
      )}
      <a className="share-btn" href={`${storyUrl}&download=1`} download onClick={() => sendEvent("share_target_selected", { channel: "copy", challenge: challenge.code })} style={{ justifyContent: "center" }}>
        <IconDownload /> Save story card
      </a>

      {guide && (
        <div className="guide" role="status">
          <h3>Posting to {CHANNEL_GUIDES[guide].label}</h3>
          <ol>
            {CHANNEL_GUIDES[guide].steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      )}
      <p className="fineprint">Nothing is posted for you. You choose where it goes, and you can edit everything first.</p>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </Backdrop>
  );
}

function Backdrop({ children, onClose, title, innerRef }: { children: React.ReactNode; onClose: () => void; title: string; innerRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={innerRef}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
