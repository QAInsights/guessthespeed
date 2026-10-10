import {
  addPlayer,
  applyResult,
  hasUsableRoundResult,
  initialGameState,
  loadGame,
  lockGuess,
  newGame,
  nextRound,
  pendingGuessers,
  removePlayer,
  unlockGuess,
  saveGame,
  STORAGE_KEY,
  updatePlayer,
  ROLES,
  type GameState,
  type GameSettings,
  type Player,
} from "../lib/game";
import { isBlockedName } from "../lib/name-filter";
import { auroraFor, auroraStyleVars } from "../lib/aurora";
import { BACKUP_KEY, clearSession, loadSession } from "../lib/classroom";
import {
  runSpeedTest,
  SpeedTestCancelledError,
  StalledError,
  type Phase,
} from "../lib/speedtest";
import { phaseText, sizeLabel, SLOW_HINT_MS } from "../lib/progress";
import { themes, themeForDate, type ThemeId } from "../lib/themes";
import { playCue } from "../lib/sound";
import {
  buildPodiumEntries,
  buildSharePayload,
  buildShareText,
  joinNames,
} from "../lib/share";
import {
  canRunRoomTest,
  getRoomView,
  isRoomMode,
  sendRoomAction,
  sendRoomProgress,
} from "./room-client";
import { readRoomLocalSettings } from "./room-settings";
import { burstConfetti } from "./confetti";
import {
  interruptedTestStep,
  type ClientAction,
  type RoomView,
} from "../lib/room";
import { roundStatEvent } from "../lib/stats";
import { sendStat } from "./stats-client";
import { recordSpeedSample } from "./history-client";
import { localizedPath } from "../lib/i18n";
import { hasPlan, loadPlan, planPercent, planTone } from "../lib/plan";
import { describeTarget, isOverlayOpen, shortcutAction } from "./shortcuts";
import { escapeHtml } from "../lib/html";
import { $, $$ } from "./dom";
import { playerEmptyState } from "./player-empty-state";
import { initializeClientLocale, t } from "../lib/messages";
import { formatNumber, type Locale } from "../lib/i18n";
import {
  GUESS_PICKS,
  stepGuess,
  type GuessDirection,
} from "../lib/guess-picks";
import { hasDistinctRole } from "../lib/player-role";
import {
  REVEAL_SUSPENSE_MS,
  REVEAL_SWING_MS,
  revealProgress,
} from "./gauge-reveal";

const pencilIcon =
  '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 256 256" fill="currentColor"><path d="m230.14 70.54l-44.68-44.69a20 20 0 0 0-28.29 0L33.86 149.17A19.85 19.85 0 0 0 28 163.31V208a20 20 0 0 0 20 20h44.69a19.86 19.86 0 0 0 14.14-5.86L230.14 98.82a20 20 0 0 0 0-28.28M91 204H52v-39l84-84l39 39Zm101-101l-39-39l18.34-18.34l39 39Z"/></svg>';
const removeIcon =
  '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 256 256" fill="currentColor"><path d="M208.49 191.51a12 12 0 0 1-17 17L128 145l-63.51 63.49a12 12 0 0 1-17-17L111 128L47.51 64.49a12 12 0 0 1 17-17L128 111l63.51-63.52a12 12 0 0 1 17 17L145 128Z"/></svg>';

type ClientPlayer = Player & { mine?: boolean };
const locale: Locale = initializeClientLocale();
const msg = (
  key: Parameters<typeof t>[0],
  params: Record<string, string | number | boolean> = {},
) => t(key, params, locale);
type ClientGameState = Omit<GameState, "players"> & {
  players: ClientPlayer[];
  isRoomHost?: boolean;
};

interface GameStore {
  persist(state: ClientGameState): void;
  send(action: ClientAction): boolean;
}

const classroomSession = loadSession();
const classroomMode = classroomSession !== null;
const roomMode = isRoomMode();
let roomStateReceived = false;
const localStore: GameStore = {
  persist: (current) => saveGame(current),
  send: () => false,
};
const roomStore: GameStore = {
  persist: () => {},
  send: (action) => sendRoomAction(action),
};
const store = roomMode ? roomStore : localStore;
const emptyRoomGame = initialGameState();
let state: ClientGameState = roomMode
  ? {
      ...emptyRoomGame,
      players: [],
      settings: { ...emptyRoomGame.settings, ...readRoomLocalSettings() },
      isRoomHost: false,
    }
  : loadGame();
let activePlayerId: string | null = null;
let editingPlayerId: string | null = null;
let gaugeValue = 0;
let gaugeTarget = 0;
let gaugeReadoutValue: number | undefined;
let animationFrame = 0;
let runInProgress = false;
let revealPending = false;
let activeRevealController: AbortController | null = null;
let activeRoomTestController: AbortController | null = null;
let interruptedRoomTestRecoveryRequested = false;
let pendingRoomResult: Extract<ClientAction, { type: "result" }> | null = null;
let activeTheme: ThemeId = "light";
let lastSpeedPhase: Phase | null = null;
let lastRoomProgressPhase: Phase | null = null;
let latestPing: number | undefined;
let roomElapsedTimer = 0;
let roomStartedAt = 0;
let shareStatusTimer = 0;
let hasAppliedRoomView = false;
const isDevMode = () =>
  !roomMode && !classroomMode && document.documentElement.dataset.dev === "1";
const isMockMode = () =>
  new URLSearchParams(window.location.search).has("mock");
const isTesting = () =>
  state.phase === "testing" || runInProgress || revealPending;
const isMine = (player: ClientPlayer) => !roomMode || player.mine === true;
const isRoomHost = () => !roomMode || state.isRoomHost === true;
const isRevealed = () =>
  (state.phase === "results" || state.phase === "champion") && !revealPending;
const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let reduceMotion = reduceMotionQuery.matches;
reduceMotionQuery.addEventListener("change", (event) => {
  reduceMotion = event.matches;
});
const guessDialog = $<HTMLDialogElement>("[data-guess-dialog]");
const guessForm = $<HTMLFormElement>("[data-guess-form]");
const startConfirmDialog = $<HTMLDialogElement>("[data-start-confirm-dialog]");
const startConfirmMessage = $<HTMLParagraphElement>(
  "[data-start-confirm-message]",
);
const startAnywayButton = $<HTMLButtonElement>("[data-start-anyway]");
const editDialog = $<HTMLDialogElement>("[data-edit-dialog]");
const editError = $<HTMLParagraphElement>("[data-edit-error]");
const championDialog = $<HTMLDialogElement>("[data-champion-dialog]");
const shareButton = $<HTMLButtonElement>("[data-share-result]");
const shareStatus = $<HTMLParagraphElement>("[data-share-status]");
const addForm = $<HTMLFormElement>("[data-add-form]");
const addError = $<HTMLParagraphElement>("[data-add-error]");
const tvAddToggle = $<HTMLButtonElement>("[data-tv-add-toggle]");
const planChips = $$<HTMLAnchorElement>("[data-plan-chip]");
const planNudge = $<HTMLButtonElement>("[data-plan-nudge]");
const startButton = $<HTMLButtonElement>("[data-start-btn]");
const errorNote = $<HTMLParagraphElement>("[data-error-note]");
const playerContainer = $<HTMLDivElement>("[data-players]");
const progressBar = $<HTMLDivElement>("[data-test-progress]");
const progressFill = $<HTMLDivElement>("[data-progress-fill]");
const liveDot = $<HTMLSpanElement>("[data-live-dot]");
const elapsedLabel = $<HTMLSpanElement>("[data-elapsed]");
const slowHint = $<HTMLSpanElement>("[data-slow-hint]");
const classroomBanner = $<HTMLElement>("[data-classroom-banner]");
const classroomChip = $<HTMLElement>("[data-classroom-chip]");
const classroomRoomNote = $<HTMLElement>("[data-classroom-room-note]");
const roomEntry = $<HTMLElement>("[data-room-entry]");
const classroomTeaser = $<HTMLElement>(".classroom-teaser");
const endClassButton = $<HTMLButtonElement>("[data-end-class]");
let tvAddExpanded = false;

function syncTVAddForm() {
  const tvLayout =
    document.documentElement.dataset.tv === "1" &&
    window.matchMedia("(min-width: 900px)").matches;
  const canAdd = !roomMode || isRoomHost();
  tvAddToggle.hidden = !tvLayout || !canAdd;
  if (!tvLayout) tvAddExpanded = false;
  if (!canAdd) tvAddExpanded = false;
  tvAddToggle.setAttribute("aria-expanded", String(tvAddExpanded));
  addForm.hidden = !canAdd || (tvLayout && !tvAddExpanded);
}

if (!roomMode && state.phase === "testing") {
  state = { ...state, phase: "guessing" };
  saveGame(state);
}

function persist() {
  store.persist(state);
}

function endClass() {
  try {
    const backup = localStorage.getItem(BACKUP_KEY);
    if (backup !== null) localStorage.setItem(STORAGE_KEY, backup);
    else saveGame(initialGameState());
    localStorage.removeItem(BACKUP_KEY);
    clearSession();
    if (loadSession())
      throw new Error("Classroom session could not be cleared");
    document.dispatchEvent(new CustomEvent("gts:classroom-change"));
    window.location.assign(localizedPath("/", locale));
  } catch {
    errorNote.textContent = msg("classroom_end_failed");
  }
}

function configureClassroomMode() {
  if (!classroomSession) return;
  classroomBanner.hidden = false;
  classroomChip.textContent = `🏫 ${classroomSession.className} · ${
    classroomSession.mode === "teams"
      ? msg("classroom_team_game")
      : msg("classroom_spotlight")
  }`;
  roomEntry.hidden = true;
  classroomTeaser.hidden = true;
  classroomRoomNote.hidden = false;
  endClassButton.addEventListener("click", endClass);
}

configureClassroomMode();

function getResolvedTheme(): ThemeId {
  if (state.settings.themeMode !== "auto") return state.settings.themeMode;
  const festival = themeForDate(new Date());
  if (festival) return festival;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function setGauge(value: number, readoutValue?: number) {
  gaugeTarget = Math.max(0, value);
  gaugeReadoutValue = readoutValue;
  if (reduceMotion) {
    gaugeValue = gaugeTarget;
    renderGauge();
    return;
  }
  if (!animationFrame) animationFrame = requestAnimationFrame(tweenGauge);
}

function tweenGauge() {
  gaugeValue += (gaugeTarget - gaugeValue) * 0.14;
  if (Math.abs(gaugeTarget - gaugeValue) < 0.02) gaugeValue = gaugeTarget;
  renderGauge();
  if (gaugeValue !== gaugeTarget) {
    animationFrame = requestAnimationFrame(tweenGauge);
  } else {
    animationFrame = 0;
  }
}

function renderGauge() {
  const progress = gaugePosition(gaugeValue);
  const gauge = $<HTMLElement>("[data-gauge]");
  applyGaugeProgress(gauge, progress);
  const live = $<HTMLSpanElement>("[data-live]");
  if (!revealPending)
    live.textContent = formatSpeed(gaugeReadoutValue ?? gaugeValue);
}

function applyGaugeProgress(gauge: HTMLElement, progress: number) {
  gauge.style.setProperty("--p", progress.toFixed(4));
  gauge.style.setProperty("--rotation", `${-120 + 240 * progress}deg`);
  gauge.toggleAttribute("data-empty", progress < 0.004);
}

function gaugePosition(value: number): number {
  const ticks = [0, 5, 10, 25, 50, 100, 250, 500, 1000];
  if (value <= 0) return 0;
  if (value >= 1000) return 1;
  let segment = 0;
  while (ticks[segment + 1] < value) segment += 1;
  return (
    (segment +
      (value - ticks[segment]) / (ticks[segment + 1] - ticks[segment])) /
    (ticks.length - 1)
  );
}

function initializeGauge() {
  const ticksGroup = $<SVGGElement>("[data-ticks]");
  const ticks = [0, 5, 10, 25, 50, 100, 250, 500, 1000];
  const cx = Number(ticksGroup.dataset.cx);
  const cy = Number(ticksGroup.dataset.cy);
  const start = Number(ticksGroup.dataset.start);
  const sweep = Number(ticksGroup.dataset.sweep);
  const point = (angle: number, radius: number) => [
    cx + radius * Math.sin((angle * Math.PI) / 180),
    cy - radius * Math.cos((angle * Math.PI) / 180),
  ];
  for (let index = 0; index <= (ticks.length - 1) * 5; index += 1) {
    const angle = start + (sweep * index) / ((ticks.length - 1) * 5);
    const major = index % 5 === 0;
    const [innerRadius, outerRadius] = major ? [118, 132] : [125, 132];
    const [x1, y1] = point(angle, innerRadius);
    const [x2, y2] = point(angle, outerRadius);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    line.setAttribute("stroke-width", major ? "2" : "1.5");
    line.setAttribute("class", `gauge-tick${major ? "" : " is-minor"}`);
    ticksGroup.append(line);

    if (!major) continue;
    const value = ticks[index / 5];
    const [x, y] = point(angle, 190);
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(x));
    text.setAttribute("y", String(y));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("class", "tick");
    text.textContent = formatNumber(value, locale);
    ticksGroup.append(text);
  }
  $$<SVGPathElement>("[data-arc]").forEach((path) => {
    const cx = Number(path.dataset.cx);
    const cy = Number(path.dataset.cy);
    const radius = Number(path.dataset.r);
    const start = Number(path.dataset.start);
    const sweep = Number(path.dataset.sweep);
    const point = (angle: number) => [
      cx + radius * Math.sin((angle * Math.PI) / 180),
      cy - radius * Math.cos((angle * Math.PI) / 180),
    ];
    const [x1, y1] = point(start);
    const [x2, y2] = point(start + sweep);
    path.setAttribute(
      "d",
      `M${x1} ${y1} A${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2}`,
    );
    path.setAttribute("pathLength", "100");
  });
}

function playerRoleMarkup(player: Pick<Player, "name" | "role">) {
  return hasDistinctRole(player.name, player.role)
    ? `<span class="p-role">${escapeHtml(player.role)}</span>`
    : "";
}

function roleFor(player: Player) {
  return `<span class="p-emoji" aria-hidden="true">${escapeHtml(player.emoji)}</span><div><h3 class="p-name">${escapeHtml(player.name)}</h3>${playerRoleMarkup(player)}</div>`;
}

function renderPlayerCard(player: ClientPlayer, index: number) {
  const roundResult = state.history
    .at(-1)
    ?.scores.find((score) => score.id === player.id);
  const revealed = isRevealed();
  const displayedScore =
    revealPending && roundResult
      ? player.score - roundResult.total
      : player.score;
  const miss = roundResult?.miss;
  const tooFar =
    miss !== null && miss !== undefined && roundResult?.place === null;
  const medal =
    roundResult?.place === 1
      ? "🥇"
      : roundResult?.place === 2
        ? "🥈"
        : roundResult?.place === 3
          ? "🥉"
          : "";
  const winnerClass = roundResult?.place === 1 && revealed ? "is-winner" : "";
  const locked = player.locked && !revealed;
  const mine = isMine(player);
  const canRemove = !roomMode || isRoomHost() || mine;
  const concealed = roomMode && !mine && !revealed;
  const points = roundResult?.total ?? 0;
  const playerTools = [
    mine
      ? `<button class="p-edit" type="button" data-edit="${escapeHtml(player.id)}" aria-label="${msg("game_edit_player", { name: escapeHtml(player.name) })}" ${isTesting() ? "disabled" : ""}>${pencilIcon}</button>`
      : "",
    canRemove
      ? `<button class="p-rm" type="button" data-remove="${escapeHtml(player.id)}" aria-label="${msg("game_remove_player", { name: escapeHtml(player.name) })}" ${isTesting() ? "disabled" : ""}>${removeIcon}</button>`
      : "",
  ]
    .filter(Boolean)
    .join("");
  const playerToolsMarkup = playerTools
    ? `<div class="p-card-tools">${playerTools}</div>`
    : "";
  const guessAction = revealed
    ? `<div class="p-results">
        <span>${msg("game_download_guess")}: ${player.guess.down === null ? msg("game_no_guess") : `${formatNumber(player.guess.down, locale)} Mbps`}</span>
        <span>${msg("game_upload_guess")}: ${player.guess.up === null ? msg("game_no_guess") : `${formatNumber(player.guess.up, locale)} Mbps`}</span>
        <span>${miss === null || miss === undefined ? msg("game_no_guess_this_round") : msg("game_average_miss", { percent: formatNumber(miss * 100, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}${tooFar ? `, ${msg("game_too_far_points")}` : ""}</span>
      </div>
      <div class="p-actions">
        <div class="p-card-guess-actions">
          <span class="points-pill ${points > 0 ? "is-positive" : "is-zero"}">${medal ? `${medal} ` : ""}${formatPointAward(points)}</span>
          ${roundResult?.bonus ? `<span class="bonus-pill">${msg("game_spot_on_points", { points: formatNumber(roundResult.bonus, locale) })}</span>` : ""}
        </div>
        ${playerToolsMarkup}
      </div>`
    : concealed
      ? `<div class="p-actions"><div class="p-card-guess-actions"><span class="room-status-pill">${locked ? `🔒 ${msg("game_locked_in")}` : msg("game_thinking")}</span></div>${playerToolsMarkup}</div>`
      : locked
        ? `<div class="p-actions"><div class="p-card-guess-actions"><button type="button" class="locked-pill" aria-label="${msg("game_locked_in")}, ${msg("game_change")}" data-guess="${escapeHtml(player.id)}" ${isTesting() ? "disabled" : ""}><span aria-hidden="true">🔒</span>${msg("game_locked_in")}</button>${roomMode ? `<button class="room-unlock" type="button" data-unlock="${escapeHtml(player.id)}" ${isTesting() ? "disabled" : ""}>${msg("game_unlock")}</button>` : ""}</div>${playerToolsMarkup}</div>`
        : `<div class="p-actions"><div class="p-card-guess-actions"><button type="button" class="guess-button" data-guess="${escapeHtml(player.id)}" ${isTesting() ? "disabled" : ""}>${msg("game_guess")}</button></div>${playerToolsMarkup}</div>`;
  return `<article class="p-card has-aurora ${winnerClass}" style="--card-index:${index};${auroraStyleVars(auroraFor(player.id))}">
    <div class="p-head">${roleFor(player)}<div class="p-score" role="group" aria-label="${escapeHtml(formatScoreLabel(displayedScore))}"><b>${formatNumber(displayedScore, locale)}</b><span>${msg("game_points_unit")}</span></div></div>
    ${guessAction}
  </article>`;
}

function renderPlayerTable(player: ClientPlayer, index: number) {
  const roundResult = state.history
    .at(-1)
    ?.scores.find((score) => score.id === player.id);
  const revealed = isRevealed();
  const displayedScore =
    revealPending && roundResult
      ? player.score - roundResult.total
      : player.score;
  const place = roundResult?.place;
  const miss = roundResult?.miss;
  const tooFar =
    miss !== null && miss !== undefined && roundResult?.place === null;
  const mine = isMine(player);
  const canRemove = !roomMode || isRoomHost() || mine;
  const medal = revealed
    ? place === 1
      ? "🥇"
      : place === 2
        ? "🥈"
        : place === 3
          ? "🥉"
          : " "
    : " ";
  const roundStatus = revealed
    ? miss === null || miss === undefined
      ? msg("game_no_guess")
      : msg("game_round_miss", {
          percent: formatNumber(miss * 100, locale, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
          tooFar: tooFar ? msg("game_too_far_short") : "",
        })
    : roomMode && !mine
      ? `<span class="room-status-pill">${player.locked ? `🔒 ${msg("game_locked_in")}` : msg("game_thinking")}</span>`
      : player.locked
        ? `<span class="p-table-round"><button class="locked-pill" type="button" data-guess="${escapeHtml(player.id)}" ${state.phase !== "guessing" || isTesting() ? "disabled" : ""}>🔒 ${msg("game_locked_in")} <small>${msg("game_change")}</small></button>${roomMode ? `<button class="room-unlock" type="button" data-unlock="${escapeHtml(player.id)}" ${isTesting() ? "disabled" : ""}>${msg("game_unlock")}</button>` : ""}</span>`
        : `<button class="guess-button" type="button" data-guess="${escapeHtml(player.id)}" ${state.phase !== "guessing" || isTesting() ? "disabled" : ""}>${msg("game_guess")}</button>`;
  return `<tr class="${place === 1 && revealed ? "is-winner" : ""}" style="--card-index:${index}">
    <td class="p-pos">${medal}${formatNumber(index + 1, locale)}</td>
    <td><span class="p-emoji">${escapeHtml(player.emoji)}</span><span class="p-name">${escapeHtml(player.name)}</span>${playerRoleMarkup(player)}</td>
    <td>${revealed ? (player.guess.down === null ? msg("game_no_guess") : `${formatNumber(player.guess.down, locale)} Mbps`) : msg("game_hidden")}</td>
    <td>${revealed ? (player.guess.up === null ? msg("game_no_guess") : `${formatNumber(player.guess.up, locale)} Mbps`) : msg("game_hidden")}</td>
    <td>${roundStatus}</td>
    <td class="p-score">${formatNumber(displayedScore, locale)} <span>${formatScoreLabel(displayedScore)}</span></td>
    <td><div class="p-table-actions">
      ${mine ? `<button class="p-edit" type="button" data-edit="${escapeHtml(player.id)}" aria-label="${msg("game_edit_player", { name: escapeHtml(player.name) })}" ${isTesting() ? "disabled" : ""}>${pencilIcon}</button>` : ""}
      ${canRemove ? `<button class="p-rm" type="button" data-remove="${escapeHtml(player.id)}" aria-label="${msg("game_remove_player", { name: escapeHtml(player.name) })}" ${isTesting() ? "disabled" : ""}>${removeIcon}</button>` : ""}
    </div></td>
  </tr>`;
}

function renderPlayers() {
  $$<HTMLButtonElement>("[data-view-toggle] button").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.view === state.view),
    );
  });
  if (!state.players.length) {
    const emptyState = playerEmptyState(roomMode, roomStateReceived);
    playerContainer.innerHTML = `<div class="p-empty"><span>${emptyState === "joining" ? "📡" : "🏁"}</span><p>${msg(emptyState === "joining" ? "room_joining" : "home_add_first_player")}</p></div>`;
  } else if (state.view === "table") {
    playerContainer.innerHTML = `<div class="p-table-wrap"><table class="p-table">
      <thead><tr><th>#</th><th>${msg("home_player_name")}</th><th>${msg("home_download")}</th><th>${msg("home_upload")}</th><th>${msg("game_round_status")}</th><th>${msg("game_score")}</th><th><span class="sr">${msg("game_player_actions")}</span></th></tr></thead>
      <tbody>${state.players.map(renderPlayerTable).join("")}</tbody>
    </table></div>`;
  } else {
    playerContainer.innerHTML = state.players.map(renderPlayerCard).join("");
  }
  $$<HTMLButtonElement>("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.remove ?? "";
      if (roomMode) {
        store.send({ type: "remove", id });
      } else {
        state = removePlayer(state, id);
        persist();
        render();
      }
    });
  });
  $$<HTMLButtonElement>("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openEdit(button.dataset.edit ?? ""));
  });
  $$<HTMLButtonElement>("[data-guess]").forEach((button) => {
    button.addEventListener("click", () =>
      openGuess(button.dataset.guess ?? ""),
    );
  });
  $$<HTMLButtonElement>("[data-unlock]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.unlock ?? "";
      if (roomMode) {
        store.send({ type: "unlock", id });
      } else {
        state = unlockGuess(state, id);
        persist();
        render();
      }
    });
  });
}

function currentRoundLabel() {
  return state.settings.rounds === "endless"
    ? msg("game_round_current", { round: formatNumber(state.round, locale) })
    : msg("home_round_one", {
        round: formatNumber(state.round, locale),
        total: formatNumber(state.settings.rounds, locale),
      });
}

function formatPointAward(points: number) {
  return msg("game_points_award", { points: formatNumber(points, locale) });
}

function formatScoreLabel(points: number) {
  return msg("game_score_short", { points: formatNumber(points, locale) });
}

function renderWinner() {
  const banner = $<HTMLDivElement>("[data-winner-banner]");
  if (!isRevealed()) {
    banner.hidden = true;
    return;
  }
  const scores = state.history.at(-1)?.scores ?? [];
  const guessedScores = scores.filter((score) => score.miss !== null);
  const winners = scores
    .filter((score) => score.place === 1)
    .flatMap((score) => {
      const player = state.players.find(
        (candidate) => candidate.id === score.id,
      );
      return player ? [{ player, score }] : [];
    });
  if (!winners.length) {
    const closest = guessedScores.reduce<(typeof guessedScores)[number] | null>(
      (best, score) =>
        best === null || score.miss! < best.miss! ? score : best,
      null,
    );
    const closestPlayer = closest
      ? state.players.find((player) => player.id === closest.id)
      : undefined;
    if (closest && closestPlayer) {
      const bonusNote = scores.some((score) => score.bonus > 0)
        ? ` ${msg("game_spot_on_still_counts")}`
        : "";
      banner.innerHTML = `<span class="wb-emoji">${escapeHtml(closestPlayer.emoji)}</span><span>${msg("game_no_place_points", { name: escapeHtml(closestPlayer.name), percent: formatNumber(closest.miss! * 100, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}${bonusNote}</span>`;
    } else {
      banner.innerHTML = `<span class="wb-emoji">🤔</span><span>${msg("game_no_locked_guesses")}</span>`;
    }
  } else {
    const names = winners.map(({ player }) => escapeHtml(player.name));
    const message =
      names.length > 1
        ? msg("game_winner_tie", { names: joinNames(names, locale) })
        : msg("game_winner_one", { name: names[0] });
    const totals = winners.map(({ score }) => score.total);
    const awards =
      winners.length === 1
        ? ` ${msg("game_winner_points", { points: formatNumber(totals[0], locale) })}`
        : totals.every((total) => total === totals[0])
          ? ` ${msg("game_each_points", { points: formatNumber(totals[0], locale) })}`
          : `: ${winners
              .map(({ player, score }) =>
                msg("game_named_points", {
                  name: escapeHtml(player.name),
                  points: formatNumber(score.total, locale),
                }),
              )
              .join("; ")}`;
    banner.innerHTML = `<span class="wb-emoji">${escapeHtml(winners[0].player.emoji)}</span><span><b>${message}</b>${awards}. ${msg("game_nice_guessing")}</span>`;
  }
  banner.hidden = false;
}

function setResults() {
  if (
    !isRevealed() &&
    (state.phase === "results" || state.phase === "champion")
  )
    return;
  const last = state.history.at(-1)?.actual;
  setResultText("ping", last?.ping ?? latestPing);
  setResultText("down", last?.down);
  setResultText("up", last?.up);
}

function setResultText(key: string, value: number | undefined) {
  $$<HTMLElement>(`[data-result="${key}"]`).forEach((element) => {
    element.textContent = value === undefined ? "-" : formatSpeed(value);
  });
}

function updatePlanComparisons() {
  const plan = loadPlan();
  const actual = isRevealed() ? state.history.at(-1)?.actual : undefined;
  for (const chip of planChips) {
    const direction = chip.dataset.planChip === "up" ? "up" : "down";
    const planned = plan[direction];
    const pct = planPercent(actual?.[direction], planned);
    if (pct === null || planned === null) {
      chip.hidden = true;
      chip.textContent = "";
      chip.removeAttribute("aria-label");
      chip.removeAttribute("title");
      chip.classList.remove("plan-chip-good", "plan-chip-ok", "plan-chip-low");
      continue;
    }
    const formattedPercent = formatNumber(pct, locale);
    const fullLabel = msg("plan_chip_long", {
      percent: formattedPercent,
      planned: formatNumber(planned, locale, { maximumFractionDigits: 0 }),
    });
    chip.textContent = msg("plan_chip_short", { percent: formattedPercent });
    chip.setAttribute("aria-label", fullLabel);
    chip.title = fullLabel;
    chip.classList.remove("plan-chip-good", "plan-chip-ok", "plan-chip-low");
    chip.classList.add(`plan-chip-${planTone(pct)}`);
    chip.hidden = false;
  }
  planNudge.hidden =
    !isRevealed() ||
    hasPlan(plan) ||
    document.documentElement.dataset.tv === "1" ||
    isDevMode() ||
    loadSession() !== null;
}

planNudge.addEventListener("click", () => {
  $<HTMLButtonElement>("[data-open-settings]").click();
  $<HTMLInputElement>("#planDown").focus();
});

document.addEventListener("gts:plan-change", updatePlanComparisons);
document.addEventListener("gts:tv-change", updatePlanComparisons);
document.addEventListener("gts:dev-change", updatePlanComparisons);
document.addEventListener("gts:classroom-change", updatePlanComparisons);

function formatSpeed(value: number) {
  return formatNumber(value, locale, {
    minimumFractionDigits: value < 100 ? 1 : 0,
    maximumFractionDigits: 1,
  });
}

async function playGaugeReveal(
  down: number,
  signal: AbortSignal,
): Promise<void> {
  const live = $<HTMLSpanElement>("[data-live]");
  const mode = $<HTMLSpanElement>("[data-mode]");
  const unit = $<HTMLSpanElement>("[data-unit]");
  const results = $$<HTMLElement>("[data-result]");
  const announcement = $<HTMLElement>("[data-reveal-announcement]");
  const gauge = $<HTMLElement>("[data-gauge]");
  const finalSpeed = formatSpeed(down);
  mode.textContent = msg("home_download");
  unit.textContent = "Mbps";

  return new Promise((resolve) => {
    let frame = 0;
    let suspenseTimer = 0;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(suspenseTimer);
      signal.removeEventListener("abort", finish);
      live.classList.remove("is-suspense");
      gaugeValue = down;
      gaugeTarget = down;
      gaugeReadoutValue = down;
      renderGauge();
      live.textContent = finalSpeed;
      live.style.removeProperty("width");
      live.removeAttribute("aria-hidden");
      results.forEach((element) => element.removeAttribute("aria-hidden"));
      const actual = state.history.at(-1)?.actual;
      setResultText("ping", actual?.ping ?? latestPing);
      setResultText("down", actual?.down);
      setResultText("up", actual?.up);
      document.documentElement.removeAttribute("data-revealing");
      if (!reduceMotion && !signal.aborted) {
        live.classList.remove("is-revealed");
        live.addEventListener(
          "animationend",
          () => live.classList.remove("is-revealed"),
          { once: true },
        );
        live.classList.add("is-revealed");
      }
      if (!signal.aborted && state.phase === "results" && actual?.down === down)
        announcement.textContent = msg("game_download_announcement", {
          speed: finalSpeed,
        });
      resolve();
    };

    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted || reduceMotion) {
      finish();
      return;
    }

    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    gaugeValue = 0;
    gaugeTarget = 0;
    gaugeReadoutValue = 0;
    applyGaugeProgress(gauge, 0);
    live.classList.remove("is-revealed", "is-suspense");
    live.setAttribute("aria-hidden", "true");
    results.forEach((element) => element.setAttribute("aria-hidden", "true"));
    announcement.textContent = "";
    document.documentElement.dataset.revealing = "1";

    live.textContent = finalSpeed;
    const numberWidth = live.getBoundingClientRect().width;
    if (numberWidth > 0) live.style.width = `${numberWidth}px`;
    live.textContent = "?";
    results.forEach((element) => {
      element.textContent = "?";
    });

    const target = gaugePosition(down);
    const startedAt = performance.now();
    const updateGauge = (now: number) => {
      if (settled) return;
      const elapsed = now - startedAt;
      const progress = revealProgress(elapsed, target);
      applyGaugeProgress(gauge, progress);
      if (elapsed < REVEAL_SWING_MS) {
        frame = requestAnimationFrame(updateGauge);
        return;
      }
      frame = 0;
      live.classList.add("is-suspense");
      suspenseTimer = window.setTimeout(finish, REVEAL_SUSPENSE_MS);
    };
    frame = requestAnimationFrame(updateGauge);
  });
}

function syncControls() {
  if (
    startConfirmDialog.open &&
    (isDevMode() ||
      state.phase !== "guessing" ||
      pendingGuessers(state.players).length === 0)
  )
    startConfirmDialog.close();
  const devMode = isDevMode();
  const host = isRoomHost();
  const canRun = !roomMode || canRunRoomTest();
  const roomView = roomMode ? getRoomView() : null;
  const assignedTester =
    roomView?.testerId === null || roomView?.testerId === undefined
      ? undefined
      : roomView.players.find((player) => player.id === roomView.testerId);
  const guessing = state.phase === "guessing";
  const testing = isTesting();
  const lockedGuess = state.players.some((player) => player.locked);
  const lockedCount = state.players.filter((player) => player.locked).length;
  const allGuessed =
    state.players.length > 0 && lockedCount === state.players.length;
  const waitingForGuesses = guessing && !allGuessed && !devMode;
  const waitingForGuess = roomMode && canRun && guessing && !lockedGuess;
  startButton.disabled =
    (!devMode && (!guessing || !lockedGuess)) || runInProgress;
  startButton.hidden =
    !revealPending &&
    ((roomMode && !canRun) ||
      (!devMode && isRevealed() && state.phase === "results") ||
      (roomMode && isRevealed() && state.phase === "champion"));
  const waiting = $<HTMLParagraphElement>("[data-room-waiting]");
  waiting.hidden =
    !roomMode ||
    revealPending ||
    (canRun && !isRevealed() && !waitingForGuess) ||
    (host && isRevealed() && state.phase === "results");
  waiting.textContent = waitingForGuess
    ? host
      ? msg("game_waiting_for_guess_host")
      : msg("game_waiting_for_guess")
    : isRevealed() && state.phase === "results"
      ? msg("game_waiting_host_continue")
      : state.phase === "testing"
        ? assignedTester
          ? msg("game_tester_running", { name: assignedTester.name })
          : msg("game_host_running")
        : assignedTester
          ? document.documentElement.dataset.roomKind === "team"
            ? msg("game_waiting_tester", { name: assignedTester.name })
            : msg("game_waiting_tester", { name: assignedTester.name })
          : document.documentElement.dataset.roomKind === "team"
            ? msg("game_waiting_host_test")
            : msg("game_waiting_host_test");
  const resetButton = $<HTMLButtonElement>("[data-reset]");
  resetButton.textContent = roomMode
    ? msg("game_new_game")
    : msg("home_reset_scores");
  resetButton.hidden = roomMode && !host;
  syncTVAddForm();
  startButton.classList.toggle(
    "is-neutral",
    revealPending || testing || waitingForGuesses,
  );
  $<HTMLSpanElement>("[data-start-label]").textContent = revealPending
    ? msg("game_testing")
    : devMode
      ? testing
        ? msg("game_testing")
        : msg("game_run_test")
      : state.phase === "testing"
        ? msg("game_testing")
        : isRevealed()
          ? msg("game_round_complete")
          : allGuessed
            ? msg("game_start_test")
            : msg("home_guesses_in", {
                done: formatNumber(lockedCount, locale),
                total: formatNumber(state.players.length, locale),
              });
  $<HTMLSpanElement>("[data-phase-text]").textContent = revealPending
    ? msg("home_drumroll")
    : devMode
      ? testing
        ? msg("game_phase_ping_files")
        : msg("home_ready")
      : state.phase === "testing"
        ? msg("game_phase_ping_files")
        : isRevealed()
          ? msg("game_results_in")
          : msg("home_ready");
  $<HTMLButtonElement>("[data-reset]").disabled = testing;
  $<HTMLInputElement>("#player-name").disabled = testing;
  $$<HTMLInputElement>("[data-emoji-picker] input").forEach((input) => {
    input.disabled = testing;
  });
  $<HTMLButtonElement>('[data-add-form] button[type="submit"]').disabled =
    testing;
  document.dispatchEvent(
    new CustomEvent<boolean>("gts:testing-change", { detail: testing }),
  );
}

function renderChampion() {
  if (isDevMode()) {
    if (championDialog.open) championDialog.close();
    return;
  }
  if (!isRevealed() || state.phase !== "champion") {
    if (championDialog.open) championDialog.close();
    return;
  }
  $<HTMLButtonElement>("[data-play-again]").hidden = roomMode && !isRoomHost();
  const teamRoom = document.documentElement.dataset.roomKind === "team";
  $<HTMLHeadingElement>("[data-champion-title]").textContent = teamRoom
    ? msg("game_team_champion_title")
    : msg("dialog_champion_title");
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const topScore = sorted[0]?.score ?? 0;
  const champions = sorted.filter((player) => player.score === topScore);
  $<HTMLParagraphElement>("[data-champion-message]").textContent = teamRoom
    ? champions.length > 1
      ? msg("game_team_champions", {
          names: joinNames(
            champions.map((player) => player.name),
            locale,
          ),
        })
      : champions.length
        ? msg("game_team_champion", { name: champions[0].name })
        : msg("game_thanks_for_playing")
    : champions.length > 1
      ? msg("game_champions_tie", {
          names: joinNames(
            champions.map((player) => player.name),
            locale,
          ),
        })
      : champions.length
        ? msg("game_champion", { name: champions[0].name })
        : msg("game_thanks_for_playing");
  $<HTMLDivElement>("[data-podium]").innerHTML = buildPodiumEntries(
    state.players,
  )
    .map(({ player, place, medal }) => {
      return `
    <div class="podium-step ${place === 1 ? "is-champion" : ""}" data-place="${place}">
      <span class="podium-medal">${medal}</span>
      <span class="podium-name">${escapeHtml(player.name)}</span>
      <span class="podium-score">${formatScoreLabel(player.score)}</span>
    </div>`;
    })
    .join("");
  const confetti = $<HTMLDivElement>("[data-champion-confetti]");
  confetti.replaceChildren();
  if (state.settings.confetti && !reduceMotion) {
    const pieces = themes[activeTheme].fx ?? ["🎉", "⭐", "🎈"];
    for (let index = 0; index < 20; index += 1) {
      const piece = document.createElement("span");
      piece.textContent = pieces[index % pieces.length];
      piece.style.left = `${(Math.random() * 100).toFixed(1)}%`;
      piece.style.fontSize = `${(14 + Math.random() * 14).toFixed(0)}px`;
      piece.style.animationDelay = `${(-Math.random() * 4.8).toFixed(1)}s`;
      piece.style.setProperty(
        "--drift",
        `${(Math.random() * 80 - 40).toFixed(0)}px`,
      );
      confetti.append(piece);
    }
  }
  if (!championDialog.open) championDialog.showModal();
}

function render() {
  const teamRoom = document.documentElement.dataset.roomKind === "team";
  $<HTMLElement>("[data-game-team-headline]").textContent = teamRoom
    ? msg("home_team_team")
    : msg("home_team_family");
  renderPlayers();
  renderWinner();
  $<HTMLSpanElement>("[data-round-label]").textContent = currentRoundLabel();
  document.documentElement.dataset.phase = state.history.length
    ? "done"
    : "idle";
  if (state.phase === "testing")
    document.documentElement.dataset.phase = "down";
  setResults();
  updatePlanComparisons();
  syncControls();
  $<HTMLFormElement>("[data-add-form]")
    .querySelectorAll('input[type="radio"]')
    .forEach((input) => {
      (input as HTMLInputElement).checked ||= false;
    });
  renderChampion();
  if (isRevealed() && state.phase === "results") {
    nextButton.textContent =
      state.settings.rounds !== "endless" &&
      state.round >= state.settings.rounds
        ? msg("game_see_champion")
        : msg("game_next_round");
    const nextRoundButton = $<HTMLButtonElement>("[data-next-round]");
    if (roomMode && !isRoomHost()) nextRoundButton.hidden = true;
    else nextRoundButton?.removeAttribute("hidden");
  } else {
    $<HTMLButtonElement>("[data-next-round]")?.setAttribute("hidden", "");
  }
}

function syncGuessPickState(direction: GuessDirection) {
  const input = guessForm.elements.namedItem(
    direction,
  ) as HTMLInputElement | null;
  if (!input) return;

  const currentValue =
    input.value.trim() === "" ? Number.NaN : Number(input.value);
  const buttons = $$<HTMLButtonElement>(
    `[data-guess-picks="${direction}"] [data-guess-value]`,
  );

  for (const button of buttons) {
    button.setAttribute(
      "aria-pressed",
      String(
        Number.isFinite(currentValue) &&
          currentValue === Number(button.dataset.guessValue),
      ),
    );
  }
}

function renderGuessPicks() {
  const plan = loadPlan();

  for (const direction of ["down", "up"] as const) {
    const group = $<HTMLDivElement>(`[data-guess-picks="${direction}"]`);
    if (!group) continue;

    group.replaceChildren();

    const addPick = (
      value: number,
      label: string,
      isPlan = false,
      includeValue = true,
    ) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `guess-pick${isPlan ? " is-plan" : ""}`;
      button.dataset.guessValue = String(value);
      button.dataset.guessPick = direction;
      button.setAttribute("aria-pressed", "false");
      button.innerHTML = `<span>${escapeHtml(label)}</span>${
        includeValue ? `<b>${escapeHtml(formatNumber(value, locale))}</b>` : ""
      }`;
      group.append(button);
    };

    const planValue = plan[direction];
    if (planValue !== null) {
      addPick(
        planValue,
        msg("guess_plan_pick", { speed: formatNumber(planValue, locale) }),
        true,
        false,
      );
    }

    for (const pick of GUESS_PICKS[direction]) {
      addPick(pick.value, msg(pick.label), false);
    }

    syncGuessPickState(direction);
  }
}

function openGuess(id: string) {
  if (state.phase !== "guessing") return;
  const player = state.players.find((candidate) => candidate.id === id);
  if (!player || !isMine(player)) return;
  activePlayerId = player.id;
  $<HTMLSpanElement>("[data-guess-emoji]").textContent = player.emoji;
  $<HTMLElement>("[data-guess-player]").textContent = player.name;
  const form = guessForm;
  (form.elements.namedItem("down") as HTMLInputElement).value =
    player.guess.down === null ? "" : String(player.guess.down);
  (form.elements.namedItem("up") as HTMLInputElement).value =
    player.guess.up === null ? "" : String(player.guess.up);
  renderGuessPicks();
  if (guessDialog.open) guessDialog.close();
  guessDialog.showModal();
  (form.elements.namedItem("down") as HTMLInputElement).focus();
}

function openEdit(id: string) {
  if (isTesting()) return;
  const player = state.players.find((candidate) => candidate.id === id);
  if (!player || !isMine(player)) return;
  editingPlayerId = player.id;
  const form = $<HTMLFormElement>("[data-edit-form]");
  editError.hidden = true;
  editError.textContent = "";
  (form.elements.namedItem("name") as HTMLInputElement).value = player.name;
  const roleIndex = ROLES.findIndex(
    (role) => role.emoji === player.emoji && role.role === player.role,
  );
  $$<HTMLInputElement>('input[name="emoji"]', form).forEach((input) => {
    input.checked = Number(input.value) === Math.max(0, roleIndex);
  });
  if (!editDialog.open) editDialog.showModal();
  (form.elements.namedItem("name") as HTMLInputElement).focus();
}

function setPhase(phase: Phase, bytes?: number) {
  document.documentElement.dataset.phase = phase;
  $<HTMLSpanElement>("[data-mode]").textContent =
    phase === "ping"
      ? msg("home_ping")
      : phase === "up"
        ? msg("home_upload")
        : msg("home_download");
  $<HTMLSpanElement>("[data-unit]").textContent =
    phase === "ping" ? "ms" : "Mbps";
  const phaseData = phaseText(phase, bytes);
  const label = msg(`game_phase_${phaseData.phase}` as Parameters<typeof t>[0]);
  $<HTMLSpanElement>("[data-phase-text]").textContent =
    phaseData.bytes === undefined
      ? label
      : msg("game_phase_size", {
          stage: label,
          size: sizeLabel(phaseData.bytes, locale),
        });
}

function setProgress(step: number, steps: number) {
  const safeSteps = Math.max(1, steps);
  const safeStep = Math.max(0, Math.min(step, safeSteps));
  progressBar.hidden = false;
  progressBar.setAttribute("aria-valuemax", String(safeSteps));
  progressBar.setAttribute("aria-valuenow", String(safeStep));
  progressFill.style.width = `${(safeStep / safeSteps) * 100}%`;
}

function setRemoteTesting(active: boolean) {
  if (!roomMode || (active && canRunRoomTest())) return;
  if (active) {
    if (!runInProgress) {
      runInProgress = true;
      roomStartedAt = Date.now();
      liveDot.hidden = false;
      if (!reduceMotion) liveDot.classList.add("is-live");
      elapsedLabel.hidden = false;
      const updateElapsed = () => {
        elapsedLabel.textContent = `· ${formatNumber(Math.floor((Date.now() - roomStartedAt) / 1000), locale)} s`;
      };
      updateElapsed();
      roomElapsedTimer = window.setInterval(updateElapsed, 1000);
    }
  } else if (runInProgress) {
    runInProgress = false;
    clearRoomElapsedTimer();
    liveDot.classList.remove("is-live");
    liveDot.hidden = true;
    elapsedLabel.hidden = true;
    slowHint.hidden = true;
    progressBar.hidden = true;
    document.dispatchEvent(
      new CustomEvent<boolean>("gts:testing-change", { detail: false }),
    );
  }
}

function clearRoomElapsedTimer() {
  window.clearInterval(roomElapsedTimer);
  roomElapsedTimer = 0;
}

function startRoomReveal(down: number) {
  const controller = new AbortController();
  activeRevealController = controller;
  void playGaugeReveal(down, controller.signal).then(() => {
    if (activeRevealController !== controller) return;
    activeRevealController = null;
    if (controller.signal.aborted || state.phase !== "results") return;
    revealPending = false;
    playCue("reveal", activeTheme, state.settings.sound);
    render();
  });
}

function applyRoomView(view: RoomView) {
  const previousPhase = state.phase;
  if (view.phase !== "testing") {
    clearRoomElapsedTimer();
    pendingRoomResult = null;
  }
  const isFirstRoomView = !hasAppliedRoomView;
  const revealActual =
    !isFirstRoomView && previousPhase === "testing" && view.phase === "results"
      ? view.history.at(-1)?.actual
      : undefined;
  if (revealPending && view.phase !== "results") {
    revealPending = false;
    const controller = activeRevealController;
    activeRevealController = null;
    controller?.abort();
  }
  const enteredChampion =
    !isFirstRoomView &&
    previousPhase !== "champion" &&
    view.phase === "champion";
  hasAppliedRoomView = true;
  const previousHistoryLength = state.history.length;
  state = {
    ...state,
    players: view.players as ClientPlayer[],
    settings: {
      ...state.settings,
      rounds: view.settings.rounds,
      tieMode: view.settings.tieMode,
    },
    round: view.round,
    phase: view.phase,
    history: view.history,
    isRoomHost: view.isHost,
  };
  if (revealActual) revealPending = true;
  if (
    previousPhase === "testing" &&
    view.phase === "guessing" &&
    view.canRunTest &&
    runInProgress
  )
    activeRoomTestController?.abort();
  if (view.phase === "testing") {
    if (previousPhase !== "testing" && !view.canRunTest)
      playCue("start", activeTheme, state.settings.sound);
    setRemoteTesting(true);
  } else {
    setRemoteTesting(false);
    if (previousPhase !== "champion" && view.phase === "champion")
      playCue("champion", activeTheme, state.settings.sound);
    lastRoomProgressPhase = null;
    if (!view.history.length && previousHistoryLength) {
      latestPing = undefined;
      setGauge(0);
      setResultText("ping", undefined);
      setResultText("down", undefined);
      setResultText("up", undefined);
    }
  }
  activeTheme = getResolvedTheme();
  render();
  if (revealActual) startRoomReveal(revealActual.down);
  if (enteredChampion && state.settings.confetti && !reduceMotion)
    burstConfetti(championDialog);
}

function applyRoomProgress(progress: {
  phase: Phase;
  mbps?: number;
  pingMs?: number;
  step?: number;
  steps?: number;
  bytes?: number;
}) {
  if (!roomMode || canRunRoomTest() || state.phase !== "testing") return;
  if (lastRoomProgressPhase !== progress.phase) {
    lastRoomProgressPhase = progress.phase;
    playCue("phase", activeTheme, state.settings.sound);
    if (progress.phase === "up") setGauge(0);
  }
  if (progress.step !== undefined && progress.steps !== undefined)
    setProgress(progress.step, progress.steps);
  if (progress.phase === "ping") setPhase("ping");
  else setPhase(progress.phase, progress.bytes);
  if (progress.mbps !== undefined) setGauge(progress.mbps);
  if (progress.pingMs !== undefined) setGauge(progress.pingMs);
  playCue(
    "tick",
    activeTheme,
    state.settings.sound,
    gaugePosition(progress.mbps ?? progress.pingMs ?? 0),
  );
}

async function startTest() {
  const devRun = isDevMode();
  if (roomMode && (!canRunRoomTest() || state.phase !== "guessing")) return;
  if (
    runInProgress ||
    (!devRun && !state.players.some((player) => player.locked))
  )
    return;
  const roomRunController = roomMode ? new AbortController() : null;
  if (roomMode && !store.send({ type: "start" })) return;
  if (roomRunController) activeRoomTestController = roomRunController;
  runInProgress = true;
  lastSpeedPhase = null;
  errorNote.hidden = true;
  if (devRun) {
    document.dispatchEvent(new CustomEvent("gts:dev-run-start"));
  } else if (!roomMode) {
    latestPing = undefined;
    state = { ...state, phase: "testing" };
    persist();
  }
  playCue("start", activeTheme, state.settings.sound);
  render();
  if (!devRun) {
    setResultText("ping", undefined);
    setResultText("down", undefined);
    setResultText("up", undefined);
  }
  setGauge(0);
  setPhase("ping");
  let currentBytes: number | undefined;
  let steps = Number(progressBar.getAttribute("aria-valuemax")) || 13;
  let lastUpdateAt = Date.now();
  let lastRoomProgressAt = 0;
  let lastRoomSentPhase: Phase | null = null;
  const startedAt = lastUpdateAt;
  const updateElapsed = () => {
    elapsedLabel.textContent = `· ${formatNumber(Math.floor((Date.now() - startedAt) / 1000), locale)} s`;
  };
  progressBar.hidden = false;
  progressBar.setAttribute("aria-valuenow", "0");
  progressFill.style.width = "0%";
  liveDot.hidden = false;
  if (!reduceMotion) liveDot.classList.add("is-live");
  elapsedLabel.hidden = false;
  slowHint.hidden = true;
  updateElapsed();
  const elapsedTimer = window.setInterval(updateElapsed, 1000);
  const slowHintTimer = window.setInterval(() => {
    if (Date.now() - lastUpdateAt >= SLOW_HINT_MS) slowHint.hidden = false;
  }, 500);
  let revealDown: number | null = null;
  try {
    const actual = await runSpeedTest(
      (update) => {
        lastUpdateAt = Date.now();
        slowHint.hidden = true;
        if (update.step !== undefined) {
          if (lastSpeedPhase !== update.phase) {
            lastSpeedPhase = update.phase;
            playCue("phase", activeTheme, state.settings.sound);
            if (update.phase === "up") setGauge(0);
          }
          if (update.bytes !== undefined) currentBytes = update.bytes;
          else if (update.phase === "ping") currentBytes = undefined;
          if (update.steps !== undefined) steps = update.steps;
          setProgress(update.step, steps);
          setPhase(update.phase, currentBytes);
        }
        if (update.mbps !== undefined) setGauge(update.mbps);
        if (update.downloadMbps !== undefined && !devRun)
          setResultText("down", update.downloadMbps);
        if (update.pingMs !== undefined) {
          setGauge(update.pingMs);
          if (!devRun) setResultText("ping", update.pingMs);
        }
        if (
          roomMode &&
          (lastRoomSentPhase !== update.phase ||
            Date.now() - lastRoomProgressAt >= 200)
        ) {
          lastRoomSentPhase = update.phase;
          lastRoomProgressAt = Date.now();
          sendRoomProgress({
            phase: update.phase,
            mbps: update.mbps,
            pingMs: update.pingMs,
            step: update.step,
            steps: update.steps,
            bytes: update.bytes,
          });
        }
        playCue(
          "tick",
          activeTheme,
          state.settings.sound,
          gaugePosition(update.mbps ?? update.pingMs ?? 0),
        );
      },
      devRun
        ? {
            onDetails: (details) =>
              document.dispatchEvent(
                new CustomEvent("gts:dev-details", { detail: details }),
              ),
          }
        : roomRunController
          ? { signal: roomRunController.signal }
          : undefined,
    );
    if (!hasUsableRoundResult(actual)) throw new Error("game_test_no_result");
    if (!isMockMode() && !roomRunController?.signal.aborted) {
      recordSpeedSample({
        at: Date.now(),
        down: actual.down,
        up: actual.up,
        ping: actual.ping,
      });
    }
    setProgress(steps, steps);
    if (devRun) {
      if (!isMockMode()) sendStat({ kind: "dev" });
      setGauge(actual.down, actual.down);
      document.documentElement.dataset.phase = state.history.length
        ? "done"
        : "idle";
      $<HTMLSpanElement>("[data-mode]").textContent = msg("home_download");
      $<HTMLSpanElement>("[data-unit]").textContent = "Mbps";
    } else if (roomMode) {
      const resultAction: Extract<ClientAction, { type: "result" }> = {
        type: "result",
        down: actual.down,
        up: actual.up,
        ping: actual.ping,
      };
      pendingRoomResult = resultAction;
      if (store.send(resultAction)) pendingRoomResult = null;
      else {
        errorNote.textContent = msg("game_room_send_failed");
        errorNote.hidden = false;
      }
      document.documentElement.dataset.phase = "done";
      $<HTMLSpanElement>("[data-mode]").textContent = msg("home_download");
      $<HTMLSpanElement>("[data-unit]").textContent = "Mbps";
    } else {
      latestPing = actual.ping;
      const lockedGuesses = state.players.filter(
        (player) => player.locked,
      ).length;
      const result = applyResult(state, actual);
      state = result.state;
      if (!isMockMode())
        sendStat(
          roundStatEvent(
            result.scores,
            actual,
            classroomMode ? "classroom" : "local",
            lockedGuesses,
          ),
        );
      persist();
      document.documentElement.dataset.phase = "done";
      $<HTMLSpanElement>("[data-mode]").textContent = msg("home_download");
      $<HTMLSpanElement>("[data-unit]").textContent = "Mbps";
      revealPending = true;
      revealDown = actual.down;
    }
    render();
  } catch (error) {
    if (roomMode && error instanceof SpeedTestCancelledError) {
      errorNote.hidden = true;
      document.documentElement.dataset.phase = state.history.length
        ? "done"
        : "idle";
      setGauge(0);
      $<HTMLSpanElement>("[data-mode]").textContent = msg("home_download");
      $<HTMLSpanElement>("[data-unit]").textContent = "Mbps";
      render();
      return;
    }
    if (roomMode) {
      store.send({ type: "abort" });
    } else if (!devRun) {
      state = { ...state, phase: "guessing" };
      persist();
    }
    errorNote.textContent =
      error instanceof StalledError
        ? msg("game_stalled")
        : msg("game_test_hiccup");
    errorNote.hidden = false;
    document.documentElement.dataset.phase = state.history.length
      ? "done"
      : "idle";
    setGauge(0);
    $<HTMLSpanElement>("[data-mode]").textContent = msg("home_download");
    $<HTMLSpanElement>("[data-unit]").textContent = "Mbps";
    render();
  } finally {
    if (roomRunController && activeRoomTestController === roomRunController)
      activeRoomTestController = null;
    window.clearInterval(elapsedTimer);
    window.clearInterval(slowHintTimer);
    liveDot.classList.remove("is-live");
    liveDot.hidden = true;
    elapsedLabel.hidden = true;
    slowHint.hidden = true;
    progressBar.hidden = true;
    runInProgress = false;
    if (roomMode) render();
    else {
      syncControls();
      if (devRun && !isDevMode()) render();
    }
  }
  if (revealDown !== null) {
    const controller = new AbortController();
    activeRevealController = controller;
    await playGaugeReveal(revealDown, controller.signal);
    if (activeRevealController === controller) {
      activeRevealController = null;
      revealPending = false;
      playCue("reveal", activeTheme, state.settings.sound);
      render();
    }
  }
}

document.addEventListener("gts:settings-change", (event) => {
  const nextSettings = (event as CustomEvent<GameSettings>).detail;
  state = {
    ...state,
    settings: roomMode
      ? {
          ...state.settings,
          themeMode: nextSettings.themeMode,
          sound: nextSettings.sound,
          confetti: nextSettings.confetti,
          animatedBorders: nextSettings.animatedBorders,
        }
      : nextSettings,
  };
  activeTheme = getResolvedTheme();
  render();
});

document.addEventListener("gts:room-state", (event) => {
  if (!roomMode) return;
  const view = (event as CustomEvent<RoomView>).detail;
  roomStateReceived = true;
  const recovery = interruptedTestStep({
    phase: view.phase,
    canRunTest: view.canRunTest,
    runInProgress,
    recoveryRequested: interruptedRoomTestRecoveryRequested,
    hasPendingResult: pendingRoomResult !== null,
  });
  interruptedRoomTestRecoveryRequested = recovery.recoveryRequested;
  applyRoomView(view);
  if (recovery.action === "resend" && pendingRoomResult) {
    if (store.send(pendingRoomResult)) {
      pendingRoomResult = null;
      errorNote.hidden = true;
    }
    return;
  }
  if (recovery.action !== "abort") return;
  errorNote.textContent = msg("game_interrupted");
  errorNote.hidden = false;
  store.send({ type: "abort" });
});

document.addEventListener("gts:room-disconnect", () => {
  if (roomElapsedTimer) setRemoteTesting(false);
  else clearRoomElapsedTimer();
});

document.addEventListener("gts:room-progress", (event) => {
  if (roomMode) applyRoomProgress((event as CustomEvent).detail);
});

document.addEventListener("gts:room-settings-change", (event) => {
  if (!roomMode || !isRoomHost()) return;
  const detail = (
    event as CustomEvent<{
      rounds: GameSettings["rounds"];
      tieMode: GameSettings["tieMode"];
    }>
  ).detail;
  store.send({
    type: "settings",
    rounds: detail.rounds,
    tieMode: detail.tieMode,
  });
});

document.addEventListener("gts:dev-change", (event) => {
  if ((event as CustomEvent<boolean>).detail) {
    if (guessDialog.open) guessDialog.close();
    if (editDialog.open) editDialog.close();
    if (championDialog.open) championDialog.close();
  }
  render();
});

$<HTMLButtonElement>("[data-close-guess]").addEventListener("click", () =>
  guessDialog.close(),
);
$<HTMLButtonElement>("[data-close-edit]").addEventListener("click", () =>
  editDialog.close(),
);
$<HTMLButtonElement>("[data-cancel-edit]").addEventListener("click", () =>
  editDialog.close(),
);
guessDialog.addEventListener("close", () => {
  const playerId = activePlayerId;
  activePlayerId = null;
  if (
    playerId &&
    (!document.activeElement || document.activeElement === document.body)
  )
    $$<HTMLButtonElement>("[data-guess]")
      .find((button) => button.dataset.guess === playerId)
      ?.focus();
});
editDialog.addEventListener("close", () => {
  const playerId = editingPlayerId;
  editingPlayerId = null;
  if (
    playerId &&
    (!document.activeElement || document.activeElement === document.body)
  )
    $$<HTMLButtonElement>("[data-edit]")
      .find((button) => button.dataset.edit === playerId)
      ?.focus();
});
$<HTMLFormElement>("[data-edit-form]").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!editingPlayerId || isTesting()) return;
  const form = event.currentTarget as HTMLFormElement;
  const nameInput = form.elements.namedItem("name") as HTMLInputElement;
  const name = nameInput.value;
  editError.hidden = true;
  editError.textContent = "";
  if (!name.trim()) {
    nameInput.focus();
    return;
  }
  if (roomMode && isBlockedName(name)) {
    editError.textContent = msg("room_error_name_blocked");
    editError.hidden = false;
    nameInput.focus();
    return;
  }
  const selected = Number(
    (
      form.querySelector(
        'input[name="emoji"]:checked',
      ) as HTMLInputElement | null
    )?.value ?? 0,
  );
  const role = ROLES[selected] ?? ROLES[0];
  if (roomMode) {
    if (
      !store.send({
        type: "edit",
        id: editingPlayerId,
        name,
        emoji: role.emoji,
        role: role.role,
      })
    )
      return;
  } else {
    state = updatePlayer(state, editingPlayerId, {
      name,
      emoji: role.emoji,
      role: role.role,
    });
    persist();
  }
  editDialog.close();
  render();
});
guessForm.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;

  const pick = event.target.closest<HTMLButtonElement>("[data-guess-pick]");
  if (pick) {
    const direction = pick.dataset.guessPick;
    if (direction !== "down" && direction !== "up") return;
    const input = guessForm.elements.namedItem(
      direction,
    ) as HTMLInputElement | null;
    if (!input) return;
    input.value = pick.dataset.guessValue ?? "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  const stepper = event.target.closest<HTMLButtonElement>("[data-guess-step]");
  if (!stepper) return;
  const direction = stepper.dataset.guessField;
  const change = Number(stepper.dataset.guessStep);
  if (
    (direction !== "down" && direction !== "up") ||
    (change !== -1 && change !== 1)
  ) {
    return;
  }
  const input = guessForm.elements.namedItem(
    direction,
  ) as HTMLInputElement | null;
  if (!input) return;
  input.value = String(stepGuess(input.value, change));
  input.dispatchEvent(new Event("input", { bubbles: true }));
});

guessForm.addEventListener("input", (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (event.target.name === "down" || event.target.name === "up") {
    syncGuessPickState(event.target.name);
  }
});

guessForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!activePlayerId) return;
  const form = event.currentTarget as HTMLFormElement;
  const parseGuess = (field: string) => {
    const raw = (form.elements.namedItem(field) as HTMLInputElement).value;
    if (!raw.trim()) return null;
    const number = Number(raw);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  const guess = { down: parseGuess("down"), up: parseGuess("up") };
  if (guess.down === null && guess.up === null) {
    $<HTMLInputElement>('[name="down"]', form).focus();
    return;
  }
  if (
    roomMode &&
    (guess.down === null ||
      guess.up === null ||
      guess.down > 100000 ||
      guess.up > 100000)
  ) {
    $<HTMLInputElement>(
      guess.down === null || guess.down > 100000
        ? '[name="down"]'
        : '[name="up"]',
      form,
    ).focus();
    return;
  }
  if (roomMode) {
    if (
      !store.send({
        type: "guess",
        id: activePlayerId,
        down: guess.down!,
        up: guess.up!,
      })
    )
      return;
  } else {
    state = lockGuess(state, activePlayerId, guess);
    persist();
  }
  guessDialog.close();
  playCue("lockIn", activeTheme, state.settings.sound);
  render();
});

startButton.addEventListener("click", () => {
  const message =
    !isDevMode() && state.phase === "guessing"
      ? pendingGuessers(state.players).length
        ? msg("game_missing_guesses", {
            names: pendingGuessers(state.players)
              .map((player) => player.name)
              .join(", "),
          })
        : null
      : null;
  if (!message) {
    void startTest();
    return;
  }
  startConfirmMessage.textContent = message;
  startConfirmDialog.showModal();
  startAnywayButton.focus();
});
startAnywayButton.addEventListener("click", () => {
  startConfirmDialog.close();
  void startTest();
});
$<HTMLButtonElement>("[data-wait-for-them]").addEventListener("click", () =>
  startConfirmDialog.close(),
);
startConfirmDialog.addEventListener("click", (event) => {
  if (event.target === startConfirmDialog) startConfirmDialog.close();
});
tvAddToggle.addEventListener("click", () => {
  tvAddExpanded = !tvAddExpanded;
  syncTVAddForm();
  if (tvAddExpanded) $<HTMLInputElement>("#player-name").focus();
});

document.addEventListener("gts:tv-change", () => {
  syncTVAddForm();
});
window.addEventListener("resize", syncTVAddForm);

addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addError.hidden = true;
  addError.textContent = "";
  const form = event.currentTarget as HTMLFormElement;
  const nameInput = form.elements.namedItem("name") as HTMLInputElement;
  const name = nameInput.value;
  if (!name.trim()) return;
  if (roomMode && isBlockedName(name)) {
    addError.textContent = msg("room_error_name_blocked");
    addError.hidden = false;
    nameInput.focus();
    return;
  }
  const selected = Number(
    (
      form.querySelector(
        'input[name="emoji"]:checked',
      ) as HTMLInputElement | null
    )?.value ?? 0,
  );
  const role = ROLES[selected] ?? ROLES[0];
  if (roomMode) {
    if (
      !store.send({
        type: "join",
        name,
        emoji: role.emoji,
        role: role.role,
      })
    )
      return;
  } else {
    const id =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    state = addPlayer(state, name, role.emoji, role.role, id);
    persist();
  }
  form.reset();
  (form.querySelector('input[name="emoji"]') as HTMLInputElement).checked =
    true;
  playCue("lockIn", activeTheme, state.settings.sound);
  render();
  $<HTMLInputElement>("#player-name").focus();
});

$<HTMLInputElement>("#player-name").addEventListener("input", () => {
  addError.hidden = true;
  addError.textContent = "";
});

$$<HTMLButtonElement>("[data-view-toggle] button").forEach((button) => {
  button.addEventListener("click", () => {
    state = {
      ...state,
      view: button.dataset.view === "table" ? "table" : "grid",
    };
    persist();
    renderPlayers();
  });
});

$<HTMLButtonElement>("[data-reset]").addEventListener("click", () => {
  if (roomMode) {
    store.send({ type: "newGame" });
    return;
  }
  state = newGame(state);
  persist();
  latestPing = undefined;
  setResultText("ping", undefined);
  setResultText("down", undefined);
  setResultText("up", undefined);
  setGauge(0);
  render();
});

$<HTMLButtonElement>("[data-play-again]").addEventListener("click", () => {
  if (roomMode && !isRoomHost()) return;
  if (roomMode) {
    if (store.send({ type: "newGame" })) championDialog.close();
    return;
  }
  championDialog.close();
  state = newGame(state);
  persist();
  latestPing = undefined;
  setGauge(0);
  setResultText("ping", undefined);
  setResultText("down", undefined);
  setResultText("up", undefined);
  playCue("champion", activeTheme, state.settings.sound);
  render();
});

$<HTMLButtonElement>("[data-close-champion]").addEventListener("click", () =>
  championDialog.close(),
);

function setShareStatus(message: string) {
  shareStatus.textContent = message;
  window.clearTimeout(shareStatusTimer);
  if (message) {
    shareStatusTimer = window.setTimeout(() => {
      shareStatus.textContent = "";
    }, 4000);
  }
}

async function shareResult() {
  const audience: "family" | "team" =
    document.documentElement.dataset.roomKind === "team" ? "team" : "family";
  const input = {
    players: state.players.map(({ name, score }) => ({ name, score })),
    lastActual: state.history.at(-1)?.actual ?? null,
    audience,
  };
  const fullText = buildShareText(input);
  const payload = buildSharePayload({ ...input, locale });
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: msg("home_title"),
        text: payload.text,
        url: payload.url,
      });
      setShareStatus("");
      return;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "AbortError"
      )
        return;
    }
  }
  try {
    await navigator.clipboard.writeText(fullText);
    setShareStatus(
      audience === "team"
        ? msg("game_share_team_copied")
        : msg("game_share_family_copied"),
    );
  } catch {
    setShareStatus(msg("game_share_failed"));
  }
}

shareButton.addEventListener("click", () => {
  void shareResult();
});

championDialog.addEventListener("close", () => {
  if (state.phase === "champion" && !isDevMode())
    $<HTMLButtonElement>("[data-open-settings]").focus();
});
const nextButton = document.createElement("button");
nextButton.type = "button";
nextButton.className = "go next-round";
nextButton.dataset.nextRound = "";
nextButton.textContent = msg("game_next_round");
nextButton.hidden = true;
nextButton.addEventListener("click", () => {
  if (roomMode) {
    if (isRoomHost()) store.send({ type: "next" });
  } else {
    const previousPhase = state.phase;
    state = nextRound(state);
    const enteredChampion =
      previousPhase !== "champion" && state.phase === "champion";
    persist();
    if (enteredChampion) {
      if (!isMockMode()) sendStat({ kind: "game" });
      playCue("champion", activeTheme, state.settings.sound);
    }
    render();
    if (enteredChampion && state.settings.confetti && !reduceMotion)
      burstConfetti(championDialog);
  }
});
$<HTMLDivElement>(".gauge-card").append(nextButton);

function isVisibleButton(button: HTMLButtonElement): boolean {
  return (
    !button.hidden &&
    button.isConnected &&
    button.getClientRects().length > 0 &&
    getComputedStyle(button).visibility !== "hidden"
  );
}

document.addEventListener("keydown", (event) => {
  const action = shortcutAction({
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    repeat: event.repeat,
    target: describeTarget(event.target),
    overlayOpen: isOverlayOpen(document),
  });
  if (revealPending && action) {
    event.preventDefault();
    return;
  }
  let button: HTMLButtonElement | null = null;
  if (action === "primary") {
    if (isVisibleButton(nextButton)) button = nextButton;
    else if (!startButton.disabled && isVisibleButton(startButton))
      button = startButton;
  } else if (action === "next" && isVisibleButton(nextButton)) {
    button = nextButton;
  }
  if (!button) return;
  event.preventDefault();
  button.click();
});

initializeGauge();
activeTheme = getResolvedTheme();
if (state.history.length) {
  const lastRound = state.history.at(-1)!;
  latestPing = lastRound.actual.ping;
  setResultText("down", lastRound.actual.down);
  setResultText("up", lastRound.actual.up);
  setResultText("ping", lastRound.actual.ping);
  setGauge(lastRound.actual.down, lastRound.actual.down);
}
render();
