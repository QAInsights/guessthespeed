import { HISTORY_KEY, parseHistory } from "../lib/history";
import {
  loadPlan,
  planPercent,
  planTone,
  savePlan,
  type InternetPlan,
} from "../lib/plan";

const planInput = document.querySelector<HTMLInputElement>(
  "[data-plan-check-plan]",
);
const measuredInput = document.querySelector<HTMLInputElement>(
  "[data-plan-check-measured]",
);
const result = document.querySelector<HTMLOutputElement>(
  "[data-plan-check-result]",
);
const status = document.querySelector<HTMLElement>("[data-plan-check-status]");
const lastTestButton = document.querySelector<HTMLButtonElement>(
  "[data-use-last-test]",
);
const saveButton =
  document.querySelector<HTMLButtonElement>("[data-save-plan]");

if (
  planInput &&
  measuredInput &&
  result &&
  status &&
  lastTestButton &&
  saveButton
) {
  const planField = planInput;
  const measuredField = measuredInput;
  const resultOutput = result;
  const statusMessage = status;
  const useLastTestButton = lastTestButton;
  const savePlanButton = saveButton;
  const savedPlan = loadPlan();
  if (savedPlan.down !== null) planField.value = String(savedPlan.down);

  function readSpeed(
    input: HTMLInputElement,
    maximum?: number,
  ): number | undefined {
    const value = input.valueAsNumber;
    return Number.isFinite(value) &&
      value > 0 &&
      (maximum === undefined || value <= maximum)
      ? value
      : undefined;
  }

  function renderResult() {
    const planned = readSpeed(planField, 10000) ?? null;
    const measured = readSpeed(measuredField);
    const pct = planPercent(measured, planned);
    resultOutput.removeAttribute("data-tone");
    if (pct === null) {
      resultOutput.textContent =
        "Enter both speeds to see how close your result is.";
      return;
    }
    const tone = planTone(pct);
    resultOutput.dataset.tone = tone;
    resultOutput.textContent = `You got ${pct}% of your plan.`;
  }

  planField.addEventListener("input", renderResult);
  measuredField.addEventListener("input", renderResult);

  useLastTestButton.addEventListener("click", () => {
    try {
      const latest = parseHistory(localStorage.getItem(HISTORY_KEY)).at(-1);
      if (!latest) {
        statusMessage.textContent =
          "No saved speed test is available in this browser yet.";
        return;
      }
      measuredField.value = String(latest.down);
      statusMessage.textContent = `Filled in the latest download result: ${latest.down.toLocaleString()} Mbps.`;
      renderResult();
    } catch {
      statusMessage.textContent =
        "Saved speed tests are not available in this browser.";
    }
  });

  savePlanButton.addEventListener("click", () => {
    const down = readSpeed(planField, 10000);
    if (down === undefined) {
      statusMessage.textContent =
        "Enter a plan download speed from 1 to 10,000 Mbps to save it.";
      return;
    }
    const plan: InternetPlan = { down, up: loadPlan().up };
    savePlan(plan);
    document.dispatchEvent(
      new CustomEvent<InternetPlan>("gts:plan-change", { detail: plan }),
    );
    statusMessage.textContent = "Saved your download plan in this browser.";
  });

  renderResult();
}
