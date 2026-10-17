import { NR_VERSION } from "./naija-rush";

export type GameSlug = "naija-rush";

export interface GameMeta {
  slug: GameSlug;
  name: string;
  tagline: string;
  version: string;
  durationLabel: string;
  status: "live";
  scoreUnit: string;
}

export const GAME: GameMeta = {
  slug: "naija-rush",
  name: "Naija Rush: Survive Lagos",
  tagline: "If you can survive Lagos, you can survive anywhere.",
  version: NR_VERSION,
  durationLabel: "60s",
  status: "live",
  scoreUnit: "pts",
};

export const GAMES: Record<GameSlug, GameMeta> = { "naija-rush": GAME };
export const isGameSlug = (s: string): s is GameSlug => s === "naija-rush";
export const liveGame = (s: string): GameMeta | null => (isGameSlug(s) ? GAME : null);
