#!/usr/bin/env node
/**
 * End to end acceptance test over real HTTP against a running server.
 * Two independent "phones": A runs and sends a challenge; B arrives from
 * WhatsApp and runs the identical street. Usage:
 *   BASE_URL=http://localhost:3001 DATABASE_URL=... pnpm test:e2e
 * DATABASE_URL is only used to backdate run start times.
 */
import postgres from "postgres";
import { playWithBot } from "../packages/core/src/naija-rush-bot.ts";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/naija_rush", { onnotice: () => {} });
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

class Phone {
  constructor(ua) {
    this.ua = ua;
    this.cookies = new Map();
  }
  async req(path, { method = "GET", body, headers = {} } = {}) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      redirect: "manual",
      headers: {
        "user-agent": this.ua,
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(body ? { "content-type": "application/json", origin: BASE } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const [k, v] = kv.split("=");
      this.cookies.set(k, v);
    }
    return res;
  }
  async json(path, opts) {
    const res = await this.req(path, opts);
    return { status: res.status, data: await res.json().catch(() => null) };
  }
}

async function runOnce(phone, { challenge, mode } = {}) {
  const start = await phone.json("/api/runs", { method: "POST", body: { challenge, mode } });
  if (start.status !== 200) throw new Error(`start failed ${start.status} ${JSON.stringify(start.data)}`);
  const bot = playWithBot(start.data.seed, "short", { delayTicks: challenge ? 0 : 3 });
  await sql`update naijarush.game_sessions set issued_at = now() - interval '64 seconds' where id = ${start.data.runId}`;
  const fin = await phone.json(`/api/runs/${start.data.runId}/finish`, {
    method: "POST",
    body: { token: start.data.token, log: { inputs: bot.inputs, endTick: bot.engine.state.tick }, score: bot.score },
  });
  return { start: start.data, fin, bot };
}

try {
  const a = new Phone("Mozilla/5.0 (Linux; Android 13; TECNO KI5) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36");
  const b = new Phone("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1");

  const home = await a.req("/");
  const homeHtml = await home.text();
  check(home.status === 200 && homeHtml.includes("Survive Lagos"), "Naija Rush home page loads");
  check(!homeHtml.includes("Beat My Score") && !homeHtml.includes("VENIX CLASH"), "home page is Naija Rush only, no Venix Clash portal");
  check(a.cookies.has("nr_gid"), "guest session cookie issued without sign up");
  check((await a.req("/play")).status === 200, "play page loads");

  const { start, fin, bot } = await runOnce(a);
  check(fin.status === 200 && fin.data.status === "valid" && fin.data.score === bot.score, `run verified by replay (score ${fin.data?.score}, ${fin.data?.stats?.distance}m)`);

  const created = await a.json("/api/challenges", { method: "POST", body: { runId: fin.data.runId, nickname: "Ada", showNickname: true } });
  check(created.status === 201, "challenge link created");
  const code = created.data.code;

  const crawler = new Phone("WhatsApp/2.24.20 A");
  const preview = await crawler.req(`/c/${code}?s=wa`);
  const html = await preview.text();
  check(preview.status === 200 && html.includes("Ada scored"), "challenge page renders for link preview crawler");
  check(html.includes('property="og:site_name" content="Naija Rush"'), "og:site_name is Naija Rush");
  check(html.includes('href="/play?challenge='), "button leads to the Naija Rush play page");
  const og = await crawler.req(`/c/${code}/opengraph-image`);
  check(og.status === 200 && og.headers.get("content-type") === "image/png", "link preview image renders");
  const story = await a.req(`/api/scorecard/${code}?format=story`);
  const bytes = new Uint8Array(await story.arrayBuffer());
  const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  check(story.status === 200 && w === 1080 && h === 1920, "story card is 1080x1920");

  check((await b.req(`/c/${code}?s=wa`)).status === 200, "friend opens the WhatsApp link with no account");
  const { start: bStart, fin: bFin } = await runOnce(b, { challenge: code });
  check(bStart.seed === start.seed && bStart.challenge.targetScore === fin.data.score, "friend runs the identical street against the real target");
  check(["beaten", "tied", "lost"].includes(bFin.data.challenge?.outcome), `result compared (${bFin.data.challenge?.outcome})`);

  await new Promise((r) => setTimeout(r, 400));
  const [ref] = await sql`select count(*) filter (where not is_bot)::int as humans, count(*) filter (where is_bot)::int as bots from naijarush.referral_clicks r join naijarush.challenges c on c.id = r.challenge_id where c.code = ${code}`;
  check(ref.humans === 1 && ref.bots >= 1, "arrival attributed to WhatsApp, crawler excluded");

  const board = await b.json("/api/leaderboards?period=daily");
  check(board.status === 200 && board.data.rows.some((r) => r.isYou), "friend appears on the daily board");
  const endless = await a.json("/api/runs", { method: "POST", body: { mode: "endless" } });
  check(endless.status === 200 && endless.data.mode === "endless", "endless mode available");

  const evil = await a.req("/api/runs", { method: "POST", body: {}, headers: { origin: "https://evil.example" } });
  check(evil.status === 403, "cross origin POST blocked");
  const dupe = await b.json(`/api/runs/${bFin.data.runId}/finish`, { method: "POST", body: { token: bStart.token, log: { inputs: [], endTick: 1 }, score: 0 } });
  check(dupe.status === 409, "replayed submission rejected");
  check((await a.req("/admin")).status === 401, "admin requires authentication");
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await sql.end();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll end to end checks passed");
process.exit(failures ? 1 : 0);
