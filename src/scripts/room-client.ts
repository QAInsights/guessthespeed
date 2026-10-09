import {
  normalizeRoomCode,
  type ClientAction,
  type RoomView,
} from "../lib/room";
import { isBlockedName } from "../lib/name-filter";
import { isRecord } from "../lib/guards";
import { loadSession } from "../lib/classroom";
import { queryOptional } from "./dom";
import { initializeClientLocale, t } from "../lib/messages";
import { LOCALE_INFO } from "../lib/i18n";
import { MAX_SPEED_MBPS } from "../lib/limits";

const locale = initializeClientLocale();
const msg = (
  key: Parameters<typeof t>[0],
  params: Record<string, string | number | boolean> = {},
) => t(key, params, locale);
const roomErrorKeys: Record<string, Parameters<typeof t>[0]> = {
  host_only: "room_error_host_only",
  test_in_progress: "room_error_test_in_progress",
  player_left: "room_error_player_left",
  player_offline: "room_error_player_offline",
  different_device_required: "room_error_other_device",
  invalid_action: "room_error_unknown",
  name_and_face_required: "room_error_name_required",
  name_blocked: "room_error_name_blocked",
  device_has_player: "game_device_full",
  room_full: "game_room_full",
  player_add_failed: "room_error_player_add",
  player_not_found: "room_error_player_not_found",
  edit_own_only: "room_error_edit_own",
  guess_own_only: "room_error_guess_own",
  guesses_closed: "room_error_guesses_closed",
  invalid_speed: "game_speed_value_invalid",
  unlock_own_only: "room_error_unlock_own",
  remove_own_only: "room_error_remove_own",
  invalid_settings: "room_error_invalid_settings",
  tester_not_found: "room_error_tester_missing",
  invalid_rotation: "room_error_invalid_rotation",
  tester_only: "room_error_tester_only",
  game_not_ready: "room_error_game_not_ready",
  guess_required: "game_need_test_guess",
  test_not_running: "game_wait_test",
  result_missing: "room_error_result_missing",
  invalid_ping: "game_ping_invalid",
  tester_or_host_only: "room_error_tester_or_host",
  unknown_action: "room_error_unknown",
  invalid_room_code: "room_join_code_invalid",
  room_not_found: "room_join_code_not_found",
  room_error_reconnecting: "room_error_reconnecting",
  room_error_check_failed: "room_error_check_failed",
  room_error_join_failed: "room_error_join_failed",
  room_copy_failed: "room_copy_failed",
  room_code_exists: "room_error_code_exists",
  room_creation_failed: "room_error_creation_failed",
  room_code_unavailable: "room_error_code_unavailable",
  request_body_too_large: "room_error_request_too_large",
  room_ended: "room_status_ended",
  not_found: "room_error_not_found",
};

function localizedError(code: string): string {
  const key = roomErrorKeys[code] ?? "room_error_unknown";
  return msg(key, { maximum: MAX_SPEED_MBPS });
}

export interface RoomProgress {
  type: "progress";
  phase: "ping" | "down" | "up";
  mbps?: number;
  pingMs?: number;
  step?: number;
  steps?: number;
  bytes?: number;
}

const classroomSessionActive = loadSession() !== null;
const isRoom =
  document.documentElement.dataset.room === "1" && !classroomSessionActive;
const params = new URLSearchParams(window.location.search);
const rawCode = params.get("room") ?? "";
const roomCode = normalizeRoomCode(rawCode);
let socket: WebSocket | null = null;
let latestView: RoomView | null = null;
let ended = false;
let reconnectAttempt = 0;
let reconnectTimer = 0;
let hostAnnouncementTimer = 0;
let pendingHostPlayerId: string | null = null;
let memoryClientId: string | null = null;

function createUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function stableClientId(): string {
  if (memoryClientId) return memoryClientId;
  try {
    const saved = localStorage.getItem("gts:client-id");
    if (
      saved &&
      saved.length <= 64 &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        saved,
      )
    ) {
      memoryClientId = saved;
      return saved;
    }
    const id = createUuid();
    memoryClientId = id;
    localStorage.setItem("gts:client-id", id);
    return id;
  } catch {
    memoryClientId = createUuid();
    return memoryClientId;
  }
}

export function isRoomMode(): boolean {
  return isRoom;
}

export function getRoomView(): RoomView | null {
  return latestView;
}

export function isRoomHost(): boolean {
  return latestView?.isHost ?? false;
}

export function canRunRoomTest(): boolean {
  return latestView?.canRunTest ?? false;
}

export function sendRoomAction(action: ClientAction): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    showRoomError("room_error_reconnecting");
    return false;
  }
  socket.send(JSON.stringify(action));
  return true;
}

export function sendRoomProgress(progress: Omit<RoomProgress, "type">): void {
  if (
    !latestView?.canRunTest ||
    !socket ||
    socket.readyState !== WebSocket.OPEN
  )
    return;
  socket.send(JSON.stringify({ type: "progress", ...progress }));
}

function roomLink(): string {
  return `${window.location.origin}${LOCALE_INFO[locale].home}?room=${roomCode ?? ""}`;
}

function roomPageUrl(code: string): string {
  const query = new URLSearchParams();
  const mockMode = params.get("mock");
  if (mockMode === "1" || mockMode === "slow" || mockMode === "stall")
    query.set("mock", mockMode);
  query.set("room", code);
  return `${LOCALE_INFO[locale].home}?${query.toString()}`;
}

function showRoomError(code: string): void {
  const message = localizedError(code);
  const joinError = queryOptional<HTMLElement>("[data-room-join-error]");
  if (joinError) {
    joinError.textContent = message;
    joinError.hidden = false;
  }
  const entryError = queryOptional<HTMLElement>("[data-room-entry-error]");
  if (entryError) {
    entryError.textContent = message;
    entryError.hidden = false;
  }
}

function setConnectionStatus(status: string): void {
  if (hostAnnouncementTimer && status === msg("room_status_connected")) return;
  if (hostAnnouncementTimer && status !== msg("room_status_host_now")) {
    window.clearTimeout(hostAnnouncementTimer);
    hostAnnouncementTimer = 0;
  }
  const target = queryOptional<HTMLElement>("[data-room-connection]");
  if (target) target.textContent = status;
}

function announceNewHost(): void {
  if (hostAnnouncementTimer) window.clearTimeout(hostAnnouncementTimer);
  hostAnnouncementTimer = 0;
  setConnectionStatus(msg("room_status_host_now"));
  hostAnnouncementTimer = window.setTimeout(() => {
    hostAnnouncementTimer = 0;
    if (latestView?.isHost) setConnectionStatus(msg("room_status_connected"));
  }, 4000);
}

function roomPickerOptions(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>("[role='option']"),
  );
}

function closeRoomPickerMenu(
  triggerSelector: string,
  menuSelector: string,
  returnFocus = false,
): void {
  const trigger = queryOptional<HTMLButtonElement>(triggerSelector);
  const menu = queryOptional<HTMLDivElement>(menuSelector);
  if (!trigger || !menu || menu.hidden) return;
  menu.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
  if (returnFocus && !trigger.disabled) trigger.focus();
}

function focusRoomPickerOption(menu: HTMLElement, index: number): void {
  const options = roomPickerOptions(menu);
  if (!options.length) return;
  const option = options[(index + options.length) % options.length];
  options.forEach((item) => {
    item.tabIndex = item === option ? 0 : -1;
  });
  option.focus();
}

function setupRoomPicker(input: {
  controlSelector: string;
  triggerSelector: string;
  menuSelector: string;
  selectedIndex: (options: HTMLButtonElement[]) => number;
}): void {
  const control = queryOptional<HTMLElement>(input.controlSelector);
  const trigger = queryOptional<HTMLButtonElement>(input.triggerSelector);
  const menu = queryOptional<HTMLDivElement>(input.menuSelector);
  if (!control || !trigger || !menu) return;
  const options = () => roomPickerOptions(menu);
  const open = (selectedIndex: number) => {
    const currentOptions = options();
    if (trigger.disabled || control.hidden || !currentOptions.length) return;
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    focusRoomPickerOption(
      menu,
      Math.max(0, Math.min(currentOptions.length - 1, selectedIndex)),
    );
  };

  trigger.addEventListener("click", () => {
    if (trigger.disabled || control.hidden) return;
    if (!menu.hidden) {
      closeRoomPickerMenu(input.triggerSelector, input.menuSelector);
      return;
    }
    open(input.selectedIndex(options()));
  });
  trigger.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (trigger.disabled || control.hidden) return;
    const currentOptions = options();
    if (!currentOptions.length) return;
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? currentOptions.length - 1
          : input.selectedIndex(currentOptions);
    open(index);
  });
  menu.addEventListener("keydown", (event) => {
    const currentOptions = options();
    const activeIndex = currentOptions.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (event.key === "Escape") {
      event.preventDefault();
      closeRoomPickerMenu(input.triggerSelector, input.menuSelector, true);
    } else if (event.key === "Tab") {
      closeRoomPickerMenu(input.triggerSelector, input.menuSelector);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRoomPickerOption(menu, activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRoomPickerOption(menu, activeIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusRoomPickerOption(menu, 0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusRoomPickerOption(menu, currentOptions.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      currentOptions[activeIndex]?.click();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menu.hidden && !control.contains(event.target as Node))
      closeRoomPickerMenu(input.triggerSelector, input.menuSelector);
  });
}

function updateRoomFacePicker(kind: RoomView["kind"] | undefined): void {
  const teamRoom = kind === "team";
  const familyFaces = queryOptional<HTMLElement>(
    '[data-room-face-set="family"]',
  );
  const teamFaces = queryOptional<HTMLElement>('[data-room-face-set="team"]');
  if (!familyFaces || !teamFaces) return;
  familyFaces.hidden = teamRoom;
  teamFaces.hidden = !teamRoom;
  const activeFaces = teamRoom ? teamFaces : familyFaces;
  if (!activeFaces.querySelector<HTMLInputElement>("input:checked")) {
    const firstFace = activeFaces.querySelector<HTMLInputElement>(
      'input[name="emoji"]',
    );
    if (firstFace) firstFace.checked = true;
  }
}

function updateRoomTesterControls(view: RoomView): void {
  const teamRoom = view.kind === "team";
  if (teamRoom) document.documentElement.dataset.roomKind = "team";
  else delete document.documentElement.dataset.roomKind;
  updateRoomFacePicker(view.kind);

  const picker = queryOptional<HTMLDivElement>("[data-room-tester-control]");
  const trigger = queryOptional<HTMLButtonElement>(
    "[data-room-tester-trigger]",
  );
  const value = queryOptional<HTMLElement>("[data-room-tester-value]");
  const menu = queryOptional<HTMLDivElement>("[data-room-tester-menu]");
  const chip = queryOptional<HTMLElement>("[data-room-tester-chip]");
  const stopButton = queryOptional<HTMLButtonElement>("[data-room-stop-test]");
  if (!picker || !trigger || !value || !menu || !chip || !stopButton) return;

  picker.hidden = !view.isHost;
  chip.hidden = view.isHost && !teamRoom;
  stopButton.hidden =
    !view.isHost || view.canRunTest || view.phase !== "testing";
  const rotateControl = queryOptional<HTMLElement>(
    "[data-room-rotate-control]",
  );
  const rotateToggle = queryOptional<HTMLInputElement>(
    "[data-room-rotate-toggle]",
  );
  if (rotateControl) rotateControl.hidden = !teamRoom || !view.isHost;
  if (rotateToggle) {
    rotateToggle.checked = view.rotateTester;
    rotateToggle.disabled = view.phase === "testing";
  }
  if (view.phase === "testing")
    closeRoomPickerMenu(
      "[data-room-tester-trigger]",
      "[data-room-tester-menu]",
    );
  trigger.disabled = view.phase === "testing";

  const tester =
    view.testerId === null
      ? undefined
      : view.players.find((player) => player.id === view.testerId);
  const selectedLabel = tester
    ? `${tester.emoji} ${tester.name}`
    : msg("room_this_screen");
  value.textContent = selectedLabel;

  if (view.isHost) {
    const options = [
      { id: null, emoji: "🖥️", name: msg("room_this_screen") },
      ...view.players
        .filter((player) => !player.mine)
        .map((player) => ({
          id: player.id,
          emoji: player.emoji,
          name: player.name,
        })),
    ];
    menu.replaceChildren(
      ...options.map((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "room-picker-option";
        button.setAttribute("role", "option");
        button.dataset.testerId = option.id ?? "";
        const selected = (view.testerId ?? "") === (option.id ?? "");
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
        const face = document.createElement("span");
        face.className = "room-picker-option-face";
        face.setAttribute("aria-hidden", "true");
        face.textContent = option.emoji;
        const name = document.createElement("span");
        name.className = "room-picker-option-name";
        name.textContent = option.name;
        button.append(face, name);
        button.addEventListener("click", () => {
          if (
            sendRoomAction({
              type: "setTester",
              id: option.id,
            })
          )
            closeRoomPickerMenu(
              "[data-room-tester-trigger]",
              "[data-room-tester-menu]",
              true,
            );
        });
        return button;
      }),
    );
  }
  if (teamRoom) {
    chip.textContent = tester
      ? msg("room_this_round_player", {
          player: `${tester.emoji} ${tester.name}`,
        })
      : msg("room_this_round_host");
  } else if (view.canRunTest) {
    chip.textContent = msg("room_test_runs_you");
  } else if (!tester) {
    chip.textContent = msg("room_test_runs_host");
  } else {
    chip.textContent = msg("room_test_runs_player", {
      player: `${tester.emoji} ${tester.name}`,
    });
  }
}

function showHostTransferDialog(player: RoomView["players"][number]): void {
  const dialog = queryOptional<HTMLDialogElement>("[data-room-host-dialog]");
  const message = queryOptional<HTMLElement>("[data-room-host-message]");
  const cancelButton = queryOptional<HTMLButtonElement>(
    "[data-cancel-host-transfer]",
  );
  if (!dialog || !message || !cancelButton) return;
  pendingHostPlayerId = player.id;
  message.textContent = msg("room_host_transfer_confirm", {
    name: player.name,
  });
  if (!dialog.open) dialog.showModal();
  cancelButton.focus();
}

function updateRoomHostControls(view: RoomView): void {
  const picker = queryOptional<HTMLElement>("[data-room-host-control]");
  const trigger = queryOptional<HTMLButtonElement>("[data-room-host-trigger]");
  const value = queryOptional<HTMLElement>("[data-room-host-value]");
  const menu = queryOptional<HTMLDivElement>("[data-room-host-menu]");
  if (!picker || !trigger || !value || !menu) return;
  const eligiblePlayers = view.players.filter((player) => !player.mine);
  const canTransfer =
    view.isHost && view.phase !== "testing" && eligiblePlayers.length > 0;
  picker.hidden = !canTransfer;
  trigger.disabled = !canTransfer;
  value.textContent = msg("room_choose_player");
  if (!canTransfer) {
    closeRoomPickerMenu("[data-room-host-trigger]", "[data-room-host-menu]");
    return;
  }
  menu.replaceChildren(
    ...eligiblePlayers.map((player, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "room-picker-option";
      button.setAttribute("role", "option");
      button.dataset.hostPlayerId = player.id;
      button.setAttribute("aria-selected", "false");
      button.tabIndex = index === 0 ? 0 : -1;
      const face = document.createElement("span");
      face.className = "room-picker-option-face";
      face.setAttribute("aria-hidden", "true");
      face.textContent = player.emoji;
      const name = document.createElement("span");
      name.className = "room-picker-option-name";
      name.textContent = player.name;
      button.append(face, name);
      button.addEventListener("click", () => {
        closeRoomPickerMenu(
          "[data-room-host-trigger]",
          "[data-room-host-menu]",
        );
        showHostTransferDialog(player);
      });
      return button;
    }),
  );
}

function showEndedRoom(): void {
  if (ended) return;
  ended = true;
  window.clearTimeout(reconnectTimer);
  setConnectionStatus(msg("room_status_ended"));
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  const dialog = queryOptional<HTMLDialogElement>("[data-room-ended-dialog]");
  if (dialog && !dialog.open) dialog.showModal();
}

function scheduleReconnect(): void {
  if (ended || !isRoom || !roomCode) return;
  const delay = Math.min(1000 * 2 ** reconnectAttempt, 10_000);
  reconnectAttempt += 1;
  setConnectionStatus(msg("room_status_reconnecting"));
  window.clearTimeout(reconnectTimer);
  reconnectTimer = window.setTimeout(() => {
    void checkThenConnect();
  }, delay);
}

async function checkThenConnect(): Promise<void> {
  if (!roomCode || ended) return;
  try {
    const response = await fetch(`/api/rooms/${roomCode}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404) {
      showEndedRoom();
      return;
    }
    if (!response.ok) throw new Error("room_not_found");
    connect();
  } catch {
    scheduleReconnect();
  }
}

function connect(): void {
  if (!roomCode || ended) return;
  if (socket) {
    const previousSocket = socket;
    socket = null;
    previousSocket.close();
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}/api/rooms/${roomCode}/ws`;
  const nextSocket = new WebSocket(url);
  socket = nextSocket;
  nextSocket.addEventListener("open", () => {
    if (socket !== nextSocket) return;
    setConnectionStatus(msg("room_status_connecting"));
    const hello: { type: "hello"; clientId: string; hostToken?: string } = {
      type: "hello",
      clientId: stableClientId(),
    };
    try {
      const hostToken = localStorage.getItem(`gts:host:${roomCode}`);
      if (hostToken) hello.hostToken = hostToken;
    } catch {
      // The player can still join if storage is unavailable.
    }
    nextSocket.send(JSON.stringify(hello));
  });
  nextSocket.addEventListener("message", (event: MessageEvent<string>) => {
    if (socket !== nextSocket) return;
    let message: unknown;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!isRecord(message)) return;
    if (
      message.type === "host" &&
      typeof message.hostToken === "string" &&
      message.hostToken.length <= 128
    ) {
      if (roomCode) {
        try {
          localStorage.setItem(`gts:host:${roomCode}`, message.hostToken);
        } catch {
          // The host can still use this connection if storage is unavailable.
        }
      }
      announceNewHost();
      return;
    }
    if (message.type === "state" && isRoomView(message.view)) {
      reconnectAttempt = 0;
      latestView = message.view;
      if (!latestView.isHost && roomCode) {
        try {
          if (localStorage.getItem(`gts:host:${roomCode}`) !== null)
            localStorage.removeItem(`gts:host:${roomCode}`);
        } catch {
          // A stale token does not affect this connection's room state.
        }
      }
      updateRoomTesterControls(latestView);
      updateRoomHostControls(latestView);
      setConnectionStatus(msg("room_status_connected"));
      if (
        !latestView.isHost &&
        !latestView.players.some((player) => player.mine)
      )
        showJoinDialog();
      else closeJoinDialog();
      document.dispatchEvent(
        new CustomEvent<RoomView>("gts:room-state", { detail: latestView }),
      );
      return;
    }
    if (message.type === "progress" && isRoomProgress(message)) {
      document.dispatchEvent(
        new CustomEvent<RoomProgress>("gts:room-progress", { detail: message }),
      );
      return;
    }
    if (message.type === "error" && typeof message.message === "string") {
      if (message.message === "room_ended") {
        showEndedRoom();
        return;
      }
      showRoomError(message.message);
    }
  });
  nextSocket.addEventListener("close", () => {
    if (socket !== nextSocket) return;
    socket = null;
    if (ended) return;
    latestView = null;
    document.dispatchEvent(new CustomEvent("gts:room-disconnect"));
    scheduleReconnect();
  });
  nextSocket.addEventListener("error", () => {
    if (socket === nextSocket && !ended)
      setConnectionStatus(msg("room_status_reconnecting"));
  });
}

function showJoinDialog(): void {
  const dialog = queryOptional<HTMLDialogElement>("[data-room-join-dialog]");
  const code = queryOptional<HTMLElement>("[data-room-join-code]");
  if (code) code.textContent = roomCode ?? "";
  if (dialog && !dialog.open) dialog.showModal();
}

function closeJoinDialog(): void {
  const dialog = queryOptional<HTMLDialogElement>("[data-room-join-dialog]");
  if (dialog?.open) dialog.close();
}

function renderQrCode(): void {
  if (!roomCode) return;
  const imageRoot = queryOptional<HTMLDivElement>("[data-room-qr-image]");
  const codeText = queryOptional<HTMLElement>("[data-room-qr-code]");
  if (!imageRoot) return;
  void import("qrcode-generator").then(({ default: qrcode }) => {
    const qr = qrcode(0, "M");
    qr.addData(roomLink(), "Byte");
    qr.make();
    const image = document.createElement("img");
    image.src = qr.createDataURL(8, 2);
    image.alt = msg("room_qr_alt", { code: roomCode });
    imageRoot.replaceChildren(image);
    if (codeText) codeText.textContent = roomCode.split("").join(" ");
  });
}

async function copyRoomLink(): Promise<void> {
  const copyButtons = [
    queryOptional<HTMLButtonElement>("[data-copy-room-link]"),
    queryOptional<HTMLButtonElement>("[data-copy-room-qr-link]"),
  ].filter((button): button is HTMLButtonElement => button !== null);
  try {
    await navigator.clipboard.writeText(roomLink());
    for (const button of copyButtons) {
      const original = button.textContent ?? msg("room_copy_link");
      button.textContent = msg("room_copied");
      window.setTimeout(() => (button.textContent = original), 1600);
    }
  } catch {
    showRoomError("room_copy_failed");
  }
}

async function joinWithCode(form: HTMLFormElement): Promise<void> {
  const input = form.elements.namedItem("code") as HTMLInputElement;
  const code = normalizeRoomCode(input.value);
  const error = queryOptional<HTMLElement>("[data-room-entry-error]");
  if (!code) {
    if (error) {
      error.textContent = msg("room_join_code_invalid");
      error.hidden = false;
    }
    return;
  }
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = true;
  if (error) error.hidden = true;
  try {
    const response = await fetch(`/api/rooms/${code}`);
    if (response.status === 404) throw new Error("room_not_found");
    if (!response.ok) throw new Error("room_error_check_failed");
    window.location.assign(roomPageUrl(code));
  } catch (failure) {
    if (error) {
      error.textContent = localizedError(
        failure instanceof Error ? failure.message : "room_error_join_failed",
      );
      error.hidden = false;
    }
    if (button) button.disabled = false;
  }
}

async function createRoom(kind: "family" | "team" = "family"): Promise<void> {
  const selector =
    kind === "team" ? "[data-create-team-room]" : "[data-create-room]";
  const button = queryOptional<HTMLButtonElement>(selector);
  const error = queryOptional<HTMLElement>("[data-room-entry-error]");
  if (button) {
    button.disabled = true;
    button.textContent = msg("room_creating");
  }
  if (error) error.hidden = true;
  try {
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const body: unknown = await response.json();
    if (
      !response.ok ||
      !isRecord(body) ||
      typeof body.code !== "string" ||
      typeof body.hostToken !== "string"
    )
      throw new Error("room_creation_failed");
    const code = normalizeRoomCode(body.code);
    if (!code) throw new Error("invalid_room_code");
    localStorage.setItem(`gts:host:${code}`, body.hostToken);
    window.location.assign(roomPageUrl(code));
  } catch (failure) {
    if (error) {
      error.textContent = localizedError(
        failure instanceof Error ? failure.message : "room_creation_failed",
      );
      error.hidden = false;
    }
    if (button) {
      button.disabled = false;
      button.textContent =
        kind === "team" ? msg("room_start_team") : msg("room_create");
    }
  }
}

function isRoomView(value: unknown): value is RoomView {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.isHost === "boolean" &&
    (value.testerId === null || typeof value.testerId === "string") &&
    (value.kind === undefined ||
      value.kind === "family" ||
      value.kind === "team") &&
    (value.rotateTester === undefined ||
      typeof value.rotateTester === "boolean") &&
    typeof value.canRunTest === "boolean" &&
    Array.isArray(value.players) &&
    value.players.every(
      (player) =>
        isRecord(player) &&
        typeof player.mine === "boolean" &&
        typeof player.id === "string" &&
        typeof player.name === "string",
    ) &&
    isRecord(value.settings) &&
    typeof value.round === "number" &&
    Array.isArray(value.history) &&
    ["guessing", "testing", "results", "champion"].includes(String(value.phase))
  );
}

function isRoomProgress(value: unknown): value is RoomProgress {
  return (
    isRecord(value) &&
    value.type === "progress" &&
    ["ping", "down", "up"].includes(String(value.phase))
  );
}

if (isRoom) {
  const bar = queryOptional<HTMLElement>("[data-room-bar]");
  const code = queryOptional<HTMLElement>("[data-room-code]");
  if (bar) bar.hidden = false;
  if (code) code.textContent = roomCode?.split("").join(" ") ?? rawCode;
  setupRoomPicker({
    controlSelector: "[data-room-tester-control]",
    triggerSelector: "[data-room-tester-trigger]",
    menuSelector: "[data-room-tester-menu]",
    selectedIndex: (options) =>
      options.findIndex(
        (option) =>
          (option.dataset.testerId ?? "") === (latestView?.testerId ?? ""),
      ),
  });
  setupRoomPicker({
    controlSelector: "[data-room-host-control]",
    triggerSelector: "[data-room-host-trigger]",
    menuSelector: "[data-room-host-menu]",
    selectedIndex: () => 0,
  });
  const hostDialog = queryOptional<HTMLDialogElement>(
    "[data-room-host-dialog]",
  );
  hostDialog?.addEventListener("close", () => {
    pendingHostPlayerId = null;
    const trigger = queryOptional<HTMLButtonElement>(
      "[data-room-host-trigger]",
    );
    if (trigger && !trigger.disabled && !trigger.hidden) trigger.focus();
  });
  queryOptional<HTMLButtonElement>(
    "[data-cancel-host-transfer]",
  )?.addEventListener("click", () => hostDialog?.close());
  queryOptional<HTMLButtonElement>(
    "[data-close-host-transfer]",
  )?.addEventListener("click", () => hostDialog?.close());
  queryOptional<HTMLButtonElement>(
    "[data-confirm-host-transfer]",
  )?.addEventListener("click", () => {
    if (
      pendingHostPlayerId !== null &&
      sendRoomAction({
        type: "transferHost",
        id: pendingHostPlayerId,
      })
    )
      hostDialog?.close();
  });
  queryOptional<HTMLInputElement>(
    "[data-room-rotate-toggle]",
  )?.addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    sendRoomAction({ type: "rotate", on: input.checked });
  });
  queryOptional<HTMLButtonElement>("[data-room-stop-test]")?.addEventListener(
    "click",
    () => {
      sendRoomAction({ type: "abort" });
    },
  );
  queryOptional<HTMLButtonElement>("[data-show-room-qr]")?.addEventListener(
    "click",
    () => {
      renderQrCode();
      queryOptional<HTMLDialogElement>("[data-room-qr-dialog]")?.showModal();
    },
  );
  queryOptional<HTMLButtonElement>("[data-close-room-qr]")?.addEventListener(
    "click",
    () => queryOptional<HTMLDialogElement>("[data-room-qr-dialog]")?.close(),
  );
  queryOptional<HTMLButtonElement>("[data-close-room-ended]")?.addEventListener(
    "click",
    () => queryOptional<HTMLDialogElement>("[data-room-ended-dialog]")?.close(),
  );
  queryOptional<HTMLButtonElement>("[data-copy-room-link]")?.addEventListener(
    "click",
    () => void copyRoomLink(),
  );
  queryOptional<HTMLButtonElement>(
    "[data-copy-room-qr-link]",
  )?.addEventListener("click", () => void copyRoomLink());
  queryOptional<HTMLFormElement>("[data-room-join-form]")?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const joinError = queryOptional<HTMLElement>("[data-room-join-error]");
      if (joinError) {
        joinError.hidden = true;
        joinError.textContent = "";
      }
      const nameInput = form.elements.namedItem("name") as HTMLInputElement;
      const name = nameInput.value;
      const selected = Number(
        form.querySelector<HTMLInputElement>('input[name="emoji"]:checked')
          ?.value ?? 0,
      );
      const activeFaces = form.querySelector<HTMLElement>(
        `[data-room-face-set="${latestView?.kind === "team" ? "team" : "family"}"]`,
      );
      const roles = Array.from(
        activeFaces?.querySelectorAll<HTMLInputElement>(
          'input[name="emoji"]',
        ) ?? [],
      );
      const roleChoice = roles[selected]?.closest("label");
      const roleName =
        roleChoice?.querySelector("small")?.textContent?.slice(0, 16) ??
        msg("room_role_player");
      const emoji =
        roleChoice?.querySelector("span")?.textContent?.slice(0, 16) ?? "🧑";
      if (!name.trim()) {
        nameInput.focus();
        return;
      }
      if (isBlockedName(name)) {
        if (joinError) {
          joinError.textContent = msg("room_error_name_blocked");
          joinError.hidden = false;
        }
        nameInput.focus();
        return;
      }
      sendRoomAction({
        type: "join",
        name,
        emoji,
        role: roleName,
      });
    },
  );
  queryOptional<HTMLDialogElement>("[data-room-join-dialog]")?.addEventListener(
    "cancel",
    (event) => {
      if (
        latestView &&
        !latestView.isHost &&
        !latestView.players.some((player) => player.mine)
      )
        event.preventDefault();
    },
  );
  document.addEventListener("gts:room-state", (event) => {
    latestView = (event as CustomEvent<RoomView>).detail;
  });
  if (!roomCode) showEndedRoom();
  else connect();
} else if (!classroomSessionActive) {
  queryOptional<HTMLButtonElement>("[data-create-room]")?.addEventListener(
    "click",
    () => void createRoom("family"),
  );
  queryOptional<HTMLButtonElement>("[data-create-team-room]")?.addEventListener(
    "click",
    () => void createRoom("team"),
  );
  queryOptional<HTMLFormElement>("[data-home-join-form]")?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      void joinWithCode(event.currentTarget as HTMLFormElement);
    },
  );
}
