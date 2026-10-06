import {
  normalizeRoomCode,
  type ClientAction,
  type RoomView,
} from "../lib/room";

export interface RoomProgress {
  type: "progress";
  phase: "ping" | "down" | "up";
  mbps?: number;
  pingMs?: number;
  step?: number;
  steps?: number;
  bytes?: number;
}

const isRoom = document.documentElement.dataset.room === "1";
const params = new URLSearchParams(window.location.search);
const rawCode = params.get("room") ?? "";
const roomCode = normalizeRoomCode(rawCode);
let socket: WebSocket | null = null;
let latestView: RoomView | null = null;
let ended = false;
let reconnectAttempt = 0;
let reconnectTimer = 0;
let memoryClientId: string | null = null;

const $ = <T extends Element>(selector: string): T | null =>
  document.querySelector(selector) as T | null;

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

export function getRoomCode(): string | null {
  return roomCode;
}

export function getRoomView(): RoomView | null {
  return latestView;
}

export function isRoomHost(): boolean {
  return latestView?.isHost ?? false;
}

export function sendRoomAction(action: ClientAction): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    showRoomError("You are reconnecting. Try again in a moment.");
    return false;
  }
  socket.send(JSON.stringify(action));
  return true;
}

export function sendRoomProgress(progress: Omit<RoomProgress, "type">): void {
  if (!latestView?.isHost || !socket || socket.readyState !== WebSocket.OPEN)
    return;
  socket.send(JSON.stringify({ type: "progress", ...progress }));
}

function roomLink(): string {
  return `${window.location.origin}/?room=${roomCode ?? ""}`;
}

function roomPageUrl(code: string): string {
  const query = new URLSearchParams();
  if (params.get("mock") === "1") query.set("mock", "1");
  query.set("room", code);
  return `/?${query.toString()}`;
}

function showRoomError(message: string): void {
  const joinError = $<HTMLElement>("[data-room-join-error]");
  if (joinError) {
    joinError.textContent = message;
    joinError.hidden = false;
  }
  const entryError = $<HTMLElement>("[data-room-entry-error]");
  if (entryError) {
    entryError.textContent = message;
    entryError.hidden = false;
  }
}

function setConnectionStatus(status: string): void {
  const target = $<HTMLElement>("[data-room-connection]");
  if (target) target.textContent = status;
}

function showEndedRoom(): void {
  if (ended) return;
  ended = true;
  window.clearTimeout(reconnectTimer);
  setConnectionStatus("Room ended");
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  const dialog = $<HTMLDialogElement>("[data-room-ended-dialog]");
  if (dialog && !dialog.open) dialog.showModal();
}

function scheduleReconnect(): void {
  if (ended || !isRoom || !roomCode) return;
  const delay = Math.min(1000 * 2 ** reconnectAttempt, 10_000);
  reconnectAttempt += 1;
  setConnectionStatus("Reconnecting...");
  window.clearTimeout(reconnectTimer);
  reconnectTimer = window.setTimeout(() => {
    void checkThenConnect();
  }, delay);
}

async function checkThenConnect(): Promise<void> {
  if (!roomCode || ended) return;
  try {
    const response = await fetch(`/api/rooms/${roomCode}`);
    if (response.status === 404) {
      showEndedRoom();
      return;
    }
    if (!response.ok) throw new Error("Room check failed");
    connect();
  } catch {
    scheduleReconnect();
  }
}

function connect(): void {
  if (!roomCode || ended) return;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}/api/rooms/${roomCode}/ws`;
  const nextSocket = new WebSocket(url);
  socket = nextSocket;
  nextSocket.addEventListener("open", () => {
    setConnectionStatus("Connecting...");
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
    let message: unknown;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!isRecord(message)) return;
    if (message.type === "state" && isRoomView(message.view)) {
      reconnectAttempt = 0;
      latestView = message.view;
      setConnectionStatus("Connected");
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
      if (message.message.toLowerCase().includes("room has ended")) {
        showEndedRoom();
        return;
      }
      showRoomError(message.message);
    }
  });
  nextSocket.addEventListener("close", () => {
    if (ended) return;
    latestView = null;
    scheduleReconnect();
  });
  nextSocket.addEventListener("error", () => {
    if (!ended) setConnectionStatus("Reconnecting...");
  });
}

function showJoinDialog(): void {
  const dialog = $<HTMLDialogElement>("[data-room-join-dialog]");
  const code = $<HTMLElement>("[data-room-join-code]");
  if (code) code.textContent = roomCode ?? "";
  if (dialog && !dialog.open) dialog.showModal();
}

function closeJoinDialog(): void {
  const dialog = $<HTMLDialogElement>("[data-room-join-dialog]");
  if (dialog?.open) dialog.close();
}

function renderQrCode(): void {
  if (!roomCode) return;
  const imageRoot = $<HTMLDivElement>("[data-room-qr-image]");
  const codeText = $<HTMLElement>("[data-room-qr-code]");
  if (!imageRoot) return;
  void import("qrcode-generator").then(({ default: qrcode }) => {
    const qr = qrcode(0, "M");
    qr.addData(roomLink(), "Byte");
    qr.make();
    const image = document.createElement("img");
    image.src = qr.createDataURL(8, 2);
    image.alt = `QR code to join room ${roomCode}`;
    imageRoot.replaceChildren(image);
    if (codeText) codeText.textContent = roomCode.split("").join(" ");
  });
}

async function copyRoomLink(): Promise<void> {
  const copyButtons = [
    $<HTMLButtonElement>("[data-copy-room-link]"),
    $<HTMLButtonElement>("[data-copy-room-qr-link]"),
  ].filter((button): button is HTMLButtonElement => button !== null);
  try {
    await navigator.clipboard.writeText(roomLink());
    for (const button of copyButtons) {
      const original = button.textContent ?? "Copy link";
      button.textContent = "Copied";
      window.setTimeout(() => (button.textContent = original), 1600);
    }
  } catch {
    showRoomError(
      "Could not copy the link. Please copy it from the address bar.",
    );
  }
}

async function joinWithCode(form: HTMLFormElement): Promise<void> {
  const input = form.elements.namedItem("code") as HTMLInputElement;
  const code = normalizeRoomCode(input.value);
  const error = $<HTMLElement>("[data-room-entry-error]");
  if (!code) {
    if (error) {
      error.textContent = "Enter a valid six-letter room code.";
      error.hidden = false;
    }
    return;
  }
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = true;
  if (error) error.hidden = true;
  try {
    const response = await fetch(`/api/rooms/${code}`);
    if (response.status === 404)
      throw new Error("That room could not be found.");
    if (!response.ok) throw new Error("Could not check that room right now.");
    window.location.assign(roomPageUrl(code));
  } catch (failure) {
    if (error) {
      error.textContent =
        failure instanceof Error ? failure.message : "Could not join the room.";
      error.hidden = false;
    }
    if (button) button.disabled = false;
  }
}

async function createRoom(): Promise<void> {
  const button = $<HTMLButtonElement>("[data-create-room]");
  const error = $<HTMLElement>("[data-room-entry-error]");
  if (button) {
    button.disabled = true;
    button.textContent = "Creating...";
  }
  if (error) error.hidden = true;
  try {
    const response = await fetch("/api/rooms", { method: "POST" });
    const body: unknown = await response.json();
    if (
      !response.ok ||
      !isRecord(body) ||
      typeof body.code !== "string" ||
      typeof body.hostToken !== "string"
    )
      throw new Error("Could not create a room. Please try again.");
    const code = normalizeRoomCode(body.code);
    if (!code) throw new Error("The server returned an invalid room code.");
    localStorage.setItem(`gts:host:${code}`, body.hostToken);
    window.location.assign(roomPageUrl(code));
  } catch (failure) {
    if (error) {
      error.textContent =
        failure instanceof Error ? failure.message : "Could not create a room.";
      error.hidden = false;
    }
    if (button) {
      button.disabled = false;
      button.textContent = "Create a room";
    }
  }
}

function isRoomView(value: unknown): value is RoomView {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.isHost === "boolean" &&
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (isRoom) {
  const bar = $<HTMLElement>("[data-room-bar]");
  const code = $<HTMLElement>("[data-room-code]");
  if (bar) bar.hidden = false;
  if (code) code.textContent = roomCode?.split("").join(" ") ?? rawCode;
  $<HTMLButtonElement>("[data-show-room-qr]")?.addEventListener("click", () => {
    renderQrCode();
    $<HTMLDialogElement>("[data-room-qr-dialog]")?.showModal();
  });
  $<HTMLButtonElement>("[data-close-room-qr]")?.addEventListener("click", () =>
    $<HTMLDialogElement>("[data-room-qr-dialog]")?.close(),
  );
  $<HTMLButtonElement>("[data-copy-room-link]")?.addEventListener(
    "click",
    () => void copyRoomLink(),
  );
  $<HTMLButtonElement>("[data-copy-room-qr-link]")?.addEventListener(
    "click",
    () => void copyRoomLink(),
  );
  $<HTMLFormElement>("[data-room-join-form]")?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const joinError = $<HTMLElement>("[data-room-join-error]");
      if (joinError) {
        joinError.hidden = true;
        joinError.textContent = "";
      }
      const name = (form.elements.namedItem("name") as HTMLInputElement).value;
      const selected = Number(
        form.querySelector<HTMLInputElement>('input[name="emoji"]:checked')
          ?.value ?? 0,
      );
      const roles = Array.from(
        document.querySelectorAll<HTMLInputElement>(
          "[data-room-emoji-picker] input[name='emoji']",
        ),
      );
      const roleChoice = roles[selected]?.closest("label");
      const roleName =
        roleChoice?.querySelector("small")?.textContent?.slice(0, 16) ??
        "Player";
      const emoji =
        roleChoice?.querySelector("span")?.textContent?.slice(0, 16) ?? "🧑";
      if (!name.trim()) {
        (form.elements.namedItem("name") as HTMLInputElement).focus();
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
  $<HTMLDialogElement>("[data-room-join-dialog]")?.addEventListener(
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
} else {
  $<HTMLButtonElement>("[data-create-room]")?.addEventListener(
    "click",
    () => void createRoom(),
  );
  $<HTMLFormElement>("[data-home-join-form]")?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      void joinWithCode(event.currentTarget as HTMLFormElement);
    },
  );
}
