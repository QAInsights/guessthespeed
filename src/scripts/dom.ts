export const $ = <T extends Element>(
  selector: string,
  root: ParentNode = document,
): T => root.querySelector(selector) as T;

export const $$ = <T extends Element>(
  selector: string,
  root: ParentNode = document,
): T[] => Array.from(root.querySelectorAll(selector)) as T[];

export const queryOptional = <T extends Element>(selector: string): T | null =>
  document.querySelector<T>(selector);
