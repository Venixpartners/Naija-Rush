/**
 * Vertical highlight clip recorder (browser only).
 *
 * Mirrors a game canvas onto a 720x1280 (9:16) canvas with a small brand
 * watermark, records it with the device's own encoder via MediaRecorder, and
 * finishes with a short end card showing the score. MP4/H.264 is preferred
 * because TikTok, Instagram and Snapchat accept it everywhere; WebM is the
 * fallback on browsers without MP4 recording.
 *
 * Nothing is uploaded. The clip stays on the device until the player shares
 * or saves it.
 */

export interface Clip {
  blob: Blob;
  mime: string;
  ext: "mp4" | "webm";
  seconds: number;
}

export interface EndCard {
  score: number;
  gameName: string;
  headline: string;
  host: string;
}

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

/** Best supported recording format, or null when clips are not possible here. */
export function clipFormat(): { mime: string; ext: "mp4" | "webm" } | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;
  const probe = document.createElement("canvas") as HTMLCanvasElement & { captureStream?: unknown };
  if (typeof probe.captureStream !== "function") return null;
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext: mime.startsWith("video/mp4") ? "mp4" : "webm" };
  }
  return null;
}

const W = 720;
const H = 1280;
const FPS = 30;

export class ClipRecorder {
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private raf = 0;
  private startedAt = 0;
  private endCard: EndCard | null = null;
  private endCardAt = 0;
  private stopped = false;

  constructor(
    private source: HTMLCanvasElement,
    private format = clipFormat(),
    private maxSeconds = 62,
  ) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d")!;
  }

  static supported() {
    return clipFormat() !== null;
  }

  start(): boolean {
    if (!this.format) return false;
    try {
      const stream = (this.canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(FPS);
      this.recorder = new MediaRecorder(stream, { mimeType: this.format.mime, videoBitsPerSecond: 2_500_000 });
      this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
      this.recorder.start(1000);
      this.startedAt = performance.now();
      this.draw();
      return true;
    } catch {
      this.recorder = null;
      return false;
    }
  }

  /** Add the end card for two seconds, then stop and return the clip. */
  finish(card: EndCard): Promise<Clip | null> {
    if (!this.recorder || this.stopped) return Promise.resolve(null);
    this.endCard = card;
    this.endCardAt = performance.now();
    return new Promise((resolve) => {
      window.setTimeout(() => {
        const rec = this.recorder!;
        rec.onstop = () => {
          this.stopped = true;
          cancelAnimationFrame(this.raf);
          const blob = new Blob(this.chunks, { type: this.format!.mime.split(";")[0] });
          const seconds = Math.round((performance.now() - this.startedAt) / 100) / 10;
          resolve(blob.size > 0 ? { blob, mime: blob.type, ext: this.format!.ext, seconds } : null);
        };
        try {
          rec.stop();
        } catch {
          resolve(null);
        }
      }, 2000);
    });
  }

  /** Stop without producing a clip (player left, or recording disabled). */
  cancel() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    try {
      this.recorder?.stop();
    } catch {
      /* already stopped */
    }
  }

  private draw = () => {
    if (this.stopped) return;
    const { ctx } = this;
    const elapsed = (performance.now() - this.startedAt) / 1000;
    if (elapsed > this.maxSeconds && !this.endCard) {
      // Safety cap: freeze on the last frame rather than growing forever.
      this.raf = requestAnimationFrame(this.draw);
      return;
    }

    // Cover fit the game canvas into 9:16.
    const sw = this.source.width;
    const sh = this.source.height;
    if (sw && sh) {
      const scale = Math.max(W / sw, H / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      try {
        ctx.drawImage(this.source, (W - dw) / 2, (H - dh) / 2, dw, dh);
      } catch {
        /* source not ready */
      }
    }

    // Watermark
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(27, 11, 58, 0.7)";
    ctx.beginPath();
    ctx.roundRect(24, H - 92, 300, 60, 16);
    ctx.fill();
    // Danfo badge
    ctx.fillStyle = "#FFC400";
    ctx.beginPath();
    ctx.roundRect(42, H - 80, 44, 30, 6);
    ctx.fill();
    ctx.fillStyle = "#15101C";
    ctx.fillRect(42, H - 64, 44, 5);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 30px 'Bricolage Grotesque Variable', system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("NAIJA RUSH", 98, H - 62);
    ctx.restore();

    if (this.endCard) this.drawEndCard(this.endCard, (performance.now() - this.endCardAt) / 1000);
    this.raf = requestAnimationFrame(this.draw);
  };

  private drawEndCard(card: EndCard, t: number) {
    const { ctx } = this;
    const a = Math.min(1, t / 0.35);
    ctx.save();
    ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#5B2BFF");
    g.addColorStop(0.6, "#FF3D8B");
    g.addColorStop(1, "#FF9A3D");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Rainbow stripes top and bottom
    for (let i = 0; i < W / 30 + 2; i++) {
      ctx.fillStyle = i % 2 ? "#15101C" : "#FFC400";
      ctx.beginPath();
      ctx.moveTo(i * 30, 0);
      ctx.lineTo(i * 30 + 30, 0);
      ctx.lineTo(i * 30 + 10, 26);
      ctx.lineTo(i * 30 - 20, 26);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(i * 30, H - 26);
      ctx.lineTo(i * 30 + 30, H - 26);
      ctx.lineTo(i * 30 + 10, H);
      ctx.lineTo(i * 30 - 20, H);
      ctx.fill();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "700 48px 'Bricolage Grotesque Variable', system-ui, sans-serif";
    ctx.fillText(card.headline, W / 2, 470);
    const pop = 0.8 + 0.2 * Math.min(1, t / 0.5);
    ctx.save();
    ctx.translate(W / 2, 680);
    ctx.scale(pop, pop);
    ctx.font = "800 220px 'Bricolage Grotesque Variable', system-ui, sans-serif";
    ctx.fillStyle = "#00C2FF";
    ctx.fillText(card.score.toLocaleString("en-NG"), 16, 16);
    ctx.fillStyle = "#FF3D8B";
    ctx.fillText(card.score.toLocaleString("en-NG"), 8, 8);
    ctx.fillStyle = "#FFC400";
    ctx.fillText(card.score.toLocaleString("en-NG"), 0, 0);
    ctx.restore();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 54px 'Bricolage Grotesque Variable', system-ui, sans-serif";
    ctx.fillText(`on ${card.gameName}`, W / 2, 790);
    ctx.fillStyle = "#FFC400";
    ctx.beginPath();
    ctx.roundRect(W / 2 - 250, 900, 500, 96, 24);
    ctx.fill();
    ctx.fillStyle = "#1B0B3A";
    ctx.font = "800 54px 'Bricolage Grotesque Variable', system-ui, sans-serif";
    ctx.fillText("Can you beat it?", W / 2, 966);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "700 36px 'Bricolage Grotesque Variable', system-ui, sans-serif";
    ctx.fillText(card.host, W / 2, 1070);
    ctx.restore();
  }
}
