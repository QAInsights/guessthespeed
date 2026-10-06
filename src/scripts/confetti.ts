import { confettiPieces } from "../lib/confetti";
import { isThemeId, themes } from "../lib/themes";

const themeColorProperties = ["--accent", "--on-accent", "--soft", "--muted"];

export function burstConfetti(container: HTMLElement): void {
  const themeId = document.documentElement.dataset.theme;
  const activeTheme =
    typeof themeId === "string" && isThemeId(themeId) ? themeId : "light";
  const computedStyle = getComputedStyle(document.documentElement);
  const colors = [
    ...new Set(
      themeColorProperties
        .map((property) => computedStyle.getPropertyValue(property).trim())
        .filter(Boolean),
    ),
  ].slice(0, 4);
  const emoji = themes[activeTheme].fx ?? [];
  const pieces = confettiPieces(
    window.innerWidth < 600 ? 36 : 70,
    colors,
    emoji,
  );
  const layer = document.createElement("div");
  layer.className = "confetti-burst";
  layer.setAttribute("popover", "manual");
  layer.setAttribute("aria-hidden", "true");

  pieces.forEach((piece) => {
    const element = document.createElement("span");
    element.className = "confetti-piece";
    element.dataset.shape = piece.shape;
    element.style.left = `${piece.x}%`;
    element.style.setProperty("--delay", `${piece.delayMs}ms`);
    element.style.setProperty("--duration", `${piece.durationMs}ms`);
    element.style.setProperty("--drift", `${piece.drift}vw`);
    element.style.setProperty("--rotate", `${piece.rotate}deg`);
    element.style.setProperty("--color", piece.color ?? "var(--accent)");
    if (piece.emoji) {
      element.classList.add("is-emoji");
      element.textContent = piece.emoji;
      element.style.fontSize = `${piece.size * 1.7}px`;
    } else {
      element.style.width = `${piece.size}px`;
      element.style.height = `${piece.size * 1.5}px`;
    }
    layer.append(element);
  });

  if (typeof layer.showPopover === "function") {
    document.body.append(layer);
    layer.showPopover();
  } else {
    container.append(layer);
  }

  const longestAnimation = pieces.reduce(
    (longest, piece) => Math.max(longest, piece.delayMs + piece.durationMs),
    0,
  );
  window.setTimeout(() => layer.remove(), longestAnimation);
}
