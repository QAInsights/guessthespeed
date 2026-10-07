export type ShortcutAction = "primary" | "next" | "fullscreen";

export interface ShortcutInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
  target: "text" | "control" | "other";
  overlayOpen: boolean;
}

export function shortcutAction(input: ShortcutInput): ShortcutAction | null {
  if (
    input.ctrlKey ||
    input.metaKey ||
    input.altKey ||
    input.repeat ||
    input.overlayOpen ||
    input.target === "text"
  )
    return null;

  if (
    (input.key === " " || input.key === "Enter") &&
    input.target !== "control"
  )
    return "primary";
  if (input.key === "n" || input.key === "N") return "next";
  if (input.key === "f" || input.key === "F") return "fullscreen";
  return null;
}

export function describeTarget(
  target: EventTarget | null,
): ShortcutInput["target"] {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  if (!element) return "other";
  if (
    element.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    )
  )
    return "text";
  if (element.closest('button, a, summary, [role="option"]')) return "control";
  return "other";
}

export function isOverlayOpen(doc: Document): boolean {
  return (
    doc.querySelector("dialog[open]") !== null ||
    doc.querySelector("[data-theme-menu]:not([hidden])") !== null
  );
}
