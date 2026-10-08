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
  startAnywayMessage,
  unlockGuess,
  saveGame,
  STORAGE_KEY,
  updatePlayer,
  ROLES,
  type GameState,
  type GameSettings,
  type Player,
} from "../lib/game";
import { BLOCKED_NAME_MESSAGE, isBlockedName } from "../lib/name-filter";
import { auroraFor, auroraStyleVars } from "../lib/aurora";
import { BACKUP_KEY, clearSession, loadSession } from "../lib/classroom";
import {
  runSpeedTest,
  SpeedTestCancelledError,
  StalledError,
  type Phase,
} from "../lib/speedtest";
import { phaseText, SLOW_HINT_MS } from "../lib/progress";
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
import {
  formatPlanChip,
  formatPlanChipShort,
  hasPlan,
  loadPlan,
  planPercent,
  planTone,
} from "../lib/plan";
import { describeTarget, isOverlayOpen, shortcutAction } from "./shortcuts";
import { escapeHtml } from "../lib/html";
import { $, $$ } from "./dom";
import { emptyPlayerMarkup } from "./player-empty-state";
import {
  REVEAL_SUSPENSE_MS,
  REVEAL_SWING_MS,
  revealProgress,
} from "./gauge-reveal";

type ClientPlayer = Player & { mine?: boolean };
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
    window.location.assign("/");
  } catch {
    errorNote.textContent =
      "The class could not end because this browser could not restore its saved game.";
  }
}

function configureClassroomMode() {
  if (!classroomSession) return;
  classroomBanner.hidden = false;
  classroomChip.textContent = `🏫 ${classroomSession.className} · ${
    classroomSession.mode === "teams" ? "Team game" : "Spotlight"
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
  gauge.style.setProperty("--p", progress.toFixed(4));
  gauge.style.setProperty("--rotation", `${-120 + 240 * progress}deg`);
  const live = $<HTMLSpanElement>("[data-live]");
  if (!revealPending)
    live.textContent = formatSpeed(gaugeReadoutValue ?? gaugeValue);
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
  for (const [index, value] of ticks.entries()) {
    const angle = ((-120 + (240 * index) / (ticks.length - 1)) * Math.PI) / 180;
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(200 + 108 * Math.sin(angle)));
    text.setAttribute("y", String(185 - 108 * Math.cos(angle)));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("class", "tick");
    text.textContent = String(value);
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

function roleFor(player: Player) {
  return `<span class="p-emoji" aria-hidden="true">${escapeHtml(player.emoji)}</span><div><h3 class="p-name">${escapeHtml(player.name)}</h3><span class="p-role">${escapeHtml(player.role)}</span></div>`;
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
  const guessAction = revealed
    ? `<div class="p-results">
        <span>Download guess: ${player.guess.down === null ? "No guess" : `${player.guess.down.toLocaleString()} Mbps`}</span>
        <span>Upload guess: ${player.guess.up === null ? "No guess" : `${player.guess.up.toLocaleString()} Mbps`}</span>
        <span>${miss === null || miss === undefined ? "No guess this round" : `${(miss * 100).toFixed(1)}% average miss${tooFar ? ", too far for place points" : ""}`}</span>
      </div>
      <div class="p-actions">
        <span class="points-pill">${medal ? `${medal} ` : ""}${formatPointAward(roundResult?.total ?? 0)}</span>
        ${roundResult?.bonus ? `<span class="bonus-pill">Spot on! +${roundResult.bonus}</span>` : ""}
      </div>`
    : concealed
      ? `<div class="p-actions"><span class="room-status-pill">${locked ? "🔒 Locked in" : "Thinking"}</span></div>`
      : locked
        ? `<div class="p-actions"><button type="button" class="locked-pill" data-guess="${escapeHtml(player.id)}" ${isTesting() ? "disabled" : ""}><span aria-hidden="true">🔒</span>Locked in <small>Change</small></button>${roomMode ? `<button class="room-unlock" type="button" data-unlock="${escapeHtml(player.id)}" ${isTesting() ? "disabled" : ""}>Unlock</button>` : ""}</div>`
        : `<div class="p-actions"><button type="button" class="guess-button" data-guess="${escapeHtml(player.id)}" ${isTesting() ? "disabled" : ""}>Guess</button></div>`;
  return `<article class="p-card has-aurora ${winnerClass}" style="--card-index:${index};${auroraStyleVars(auroraFor(player.id))}">
    ${mine ? `<button class="p-edit" type="button" data-edit="${escapeHtml(player.id)}" aria-label="Edit ${escapeHtml(player.name)}" ${isTesting() ? "disabled" : ""}><span aria-hidden="true">✎</span></button>` : ""}
    ${canRemove ? `<button class="p-rm" type="button" data-remove="${escapeHtml(player.id)}" aria-label="Remove ${escapeHtml(player.name)}" ${isTesting() ? "disabled" : ""}>×</button>` : ""}
    <div class="p-head">${roleFor(player)}<div class="p-score"><b>${displayedScore}</b><span>${displayedScore === 1 ? "pt" : "pts"}</span></div></div>
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
      ? "No guess"
      : `${(miss * 100).toFixed(1)}% miss${tooFar ? " (too far)" : ""}`
    : roomMode && !mine
      ? `<span class="room-status-pill">${player.locked ? "🔒 Locked in" : "Thinking"}</span>`
      : player.locked
        ? `<span class="p-table-round"><button class="locked-pill" type="button" data-guess="${escapeHtml(player.id)}" ${state.phase !== "guessing" || isTesting() ? "disabled" : ""}>🔒 Locked in <small>Change</small></button>${roomMode ? `<button class="room-unlock" type="button" data-unlock="${escapeHtml(player.id)}" ${isTesting() ? "disabled" : ""}>Unlock</button>` : ""}</span>`
        : `<button class="guess-button" type="button" data-guess="${escapeHtml(player.id)}" ${state.phase !== "guessing" || isTesting() ? "disabled" : ""}>Guess</button>`;
  return `<tr class="${place === 1 && revealed ? "is-winner" : ""}" style="--card-index:${index}">
    <td class="p-pos">${medal}${index + 1}</td>
    <td><span class="p-emoji">${escapeHtml(player.emoji)}</span><span class="p-name">${escapeHtml(player.name)}</span><span class="p-role">${escapeHtml(player.role)}</span></td>
    <td>${revealed ? (player.guess.down === null ? "No guess" : `${player.guess.down.toLocaleString()} Mbps`) : "Hidden"}</td>
    <td>${revealed ? (player.guess.up === null ? "No guess" : `${player.guess.up.toLocaleString()} Mbps`) : "Hidden"}</td>
    <td>${roundStatus}</td>
    <td class="p-score">${formatScoreLabel(displayedScore)}</td>
    <td><div class="p-table-actions">
      ${mine ? `<button class="p-edit" type="button" data-edit="${escapeHtml(player.id)}" aria-label="Edit ${escapeHtml(player.name)}" ${isTesting() ? "disabled" : ""}><span aria-hidden="true">✎</span></button>` : ""}
      ${canRemove ? `<button class="p-rm" type="button" data-remove="${escapeHtml(player.id)}" aria-label="Remove ${escapeHtml(player.name)}" ${isTesting() ? "disabled" : ""}>×</button>` : ""}
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
    playerContainer.innerHTML = emptyPlayerMarkup(roomMode, roomStateReceived);
  } else if (state.view === "table") {
    playerContainer.innerHTML = `<div class="p-table-wrap"><table class="p-table">
      <thead><tr><th>#</th><th>Player</th><th>Download</th><th>Upload</th><th>Round status</th><th>Score</th><th><span class="sr">Player actions</span></th></tr></thead>
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
    ? `Round ${state.round}`
    : `Round ${state.round} of ${state.settings.rounds}`;
}

function formatPointAward(points: number) {
  return `+${points} ${points === 1 ? "point" : "points"}`;
}

function formatScoreLabel(points: number) {
  return `${points} ${points === 1 ? "pt" : "pts"}`;
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
        ? " Spot-on bonuses still count."
        : "";
      banner.innerHTML = `<span class="wb-emoji">${escapeHtml(closestPlayer.emoji)}</span><span><b>Nobody landed within 50% this round</b>, so no place points. Closest was ${escapeHtml(closestPlayer.name)} at ${(closest.miss! * 100).toFixed(1)}% off.${bonusNote}</span>`;
    } else {
      banner.innerHTML =
        '<span class="wb-emoji">🤔</span><span>No locked guesses this round. Everyone can try again next round.</span>';
    }
  } else {
    const names = winners.map(({ player }) => escapeHtml(player.name));
    const message =
      names.length > 1
        ? `${joinNames(names)} tie for the win`
        : `${names[0]} wins the round`;
    const totals = winners.map(({ score }) => score.total);
    const awards =
      winners.length === 1
        ? ` and gets ${formatPointAward(totals[0])}`
        : totals.every((total) => total === totals[0])
          ? ` and each get ${formatPointAward(totals[0])}`
          : `: ${winners
              .map(
                ({ player, score }) =>
                  `${escapeHtml(player.name)} gets ${formatPointAward(score.total)}`,
              )
              .join("; ")}`;
    banner.innerHTML = `<span class="wb-emoji">${escapeHtml(winners[0].player.emoji)}</span><span><b>${message}</b>${awards}. Nice guessing!</span>`;
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
    const fullLabel = formatPlanChip(pct, planned);
    chip.textContent = formatPlanChipShort(pct);
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
  return value >= 100
    ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : value.toFixed(1);
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
  mode.textContent = "Download";
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
        announcement.textContent = `Download speed: ${finalSpeed} Mbps.`;
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
    gauge.style.setProperty("--p", "0");
    gauge.style.setProperty("--rotation", "-120deg");
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
      gauge.style.setProperty("--p", progress.toFixed(4));
      gauge.style.setProperty("--rotation", `${-120 + 240 * progress}deg`);
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
      ? "Start unlocks once someone locks in a guess. Tap Guess on your phone, or add a player on this screen."
      : "Start unlocks once someone locks in a guess."
    : isRevealed() && state.phase === "results"
      ? "Waiting for the host to continue."
      : state.phase === "testing"
        ? assignedTester
          ? `${assignedTester.name} is running the speed test.`
          : "The host is running the speed test."
        : assignedTester
          ? document.documentElement.dataset.roomKind === "team"
            ? `Waiting for ${assignedTester.name} to start their test.`
            : `Waiting for ${assignedTester.name} to start the test.`
          : document.documentElement.dataset.roomKind === "team"
            ? "Waiting for the host to start their test."
            : "Waiting for the host to start the test.";
  const resetButton = $<HTMLButtonElement>("[data-reset]");
  resetButton.textContent = roomMode ? "New game" : "Reset scores";
  resetButton.hidden = roomMode && !host;
  syncTVAddForm();
  $<HTMLSpanElement>("[data-start-label]").textContent = revealPending
    ? "Testing..."
    : devMode
      ? testing
        ? "Testing..."
        : "Run speed test"
      : state.phase === "testing"
        ? "Testing..."
        : isRevealed()
          ? "Round complete"
          : state.players.some((player) => player.locked)
            ? "Start the speed test"
            : "Waiting for guesses";
  $<HTMLSpanElement>("[data-phase-text]").textContent = revealPending
    ? "Drumroll..."
    : devMode
      ? testing
        ? "Pinging Cloudflare"
        : "Ready when you are"
      : state.phase === "testing"
        ? "Pinging Cloudflare"
        : isRevealed()
          ? "Results are in"
          : "Ready when you are";
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
    ? "Best Wi-Fi guesser on the team!"
    : "Game night champion!";
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const topScore = sorted[0]?.score ?? 0;
  const champions = sorted.filter((player) => player.score === topScore);
  $<HTMLParagraphElement>("[data-champion-message]").textContent = teamRoom
    ? champions.length > 1
      ? `${joinNames(champions.map((player) => player.name))} are the team's speed champions!`
      : champions.length
        ? `${champions[0].name} is the team's speed champion!`
        : "Thanks for playing together!"
    : champions.length > 1
      ? `${joinNames(champions.map((player) => player.name))} tie for the win!`
      : champions.length
        ? `${champions[0].name} is this game night’s speed champion!`
        : "Thanks for playing together!";
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
    ? "Beat the team."
    : "Beat the family.";
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
        ? "See the champion"
        : "Next round";
    const nextRoundButton = $<HTMLButtonElement>("[data-next-round]");
    if (roomMode && !isRoomHost()) nextRoundButton.hidden = true;
    else nextRoundButton?.removeAttribute("hidden");
  } else {
    $<HTMLButtonElement>("[data-next-round]")?.setAttribute("hidden", "");
  }
}

function openGuess(id: string) {
  if (state.phase !== "guessing") return;
  const player = state.players.find((candidate) => candidate.id === id);
  if (!player || !isMine(player)) return;
  activePlayerId = player.id;
  $<HTMLSpanElement>("[data-guess-emoji]").textContent = player.emoji;
  $<HTMLElement>("[data-guess-player]").textContent = player.name;
  const form = $<HTMLFormElement>("[data-guess-form]");
  (form.elements.namedItem("down") as HTMLInputElement).value =
    player.guess.down === null ? "" : String(player.guess.down);
  (form.elements.namedItem("up") as HTMLInputElement).value =
    player.guess.up === null ? "" : String(player.guess.up);
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
    phase === "ping" ? "Ping" : phase === "up" ? "Upload" : "Download";
  $<HTMLSpanElement>("[data-unit]").textContent =
    phase === "ping" ? "ms" : "Mbps";
  $<HTMLSpanElement>("[data-phase-text]").textContent = phaseText(phase, bytes);
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
        elapsedLabel.textContent = `· ${Math.floor((Date.now() - roomStartedAt) / 1000)} s`;
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
    elapsedLabel.textContent = `· ${Math.floor((Date.now() - startedAt) / 1000)} s`;
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
    if (!hasUsableRoundResult(actual))
      throw new Error("The speed test returned no result.");
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
      $<HTMLSpanElement>("[data-mode]").textContent = "Download";
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
        errorNote.textContent =
          "The result could not reach the room. Reconnect and try again.";
        errorNote.hidden = false;
      }
      document.documentElement.dataset.phase = "done";
      $<HTMLSpanElement>("[data-mode]").textContent = "Download";
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
      $<HTMLSpanElement>("[data-mode]").textContent = "Download";
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
      $<HTMLSpanElement>("[data-mode]").textContent = "Download";
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
        ? "The test stalled with no data for 45 seconds. Check your connection and press Start to try again."
        : "The speed test hiccuped. Try again?";
    errorNote.hidden = false;
    document.documentElement.dataset.phase = state.history.length
      ? "done"
      : "idle";
    setGauge(0);
    $<HTMLSpanElement>("[data-mode]").textContent = "Download";
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
  errorNote.textContent =
    "The last test was interrupted. Press Start to run it again.";
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
    editError.textContent = BLOCKED_NAME_MESSAGE;
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
$<HTMLFormElement>("[data-guess-form]").addEventListener("submit", (event) => {
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
      ? startAnywayMessage(state.players)
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
    addError.textContent = BLOCKED_NAME_MESSAGE;
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
  const payload = buildSharePayload(input);
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: "Guess the Speed",
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
        ? "Copied! Paste it in your team chat."
        : "Copied! Paste it in your family chat.",
    );
  } catch {
    setShareStatus("Could not share from this browser.");
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
nextButton.textContent = "Next round";
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
