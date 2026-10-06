import {
  ACTIVITY_RATES,
  recommendSpeed,
  type ActivityId,
} from "../lib/speed-needs";

const calculator = document.querySelector<HTMLElement>("[data-speed-needs]");

if (calculator) {
  const activityIds = Object.keys(ACTIVITY_RATES) as ActivityId[];
  const counts = Object.fromEntries(
    activityIds.map((activity) => [activity, 0]),
  ) as Record<ActivityId, number>;
  const formatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  });

  const render = () => {
    for (const activity of activityIds) {
      const count = counts[activity];
      const output = calculator.querySelector<HTMLOutputElement>(
        `[data-count="${activity}"]`,
      );
      if (output) output.textContent = String(count);

      calculator
        .querySelectorAll<HTMLButtonElement>(`[data-activity="${activity}"]`)
        .forEach((button) => {
          button.disabled =
            (button.dataset.change === "-1" && count === 0) ||
            (button.dataset.change === "1" && count === 12);
        });
    }

    const recommendation = recommendSpeed(counts);
    const down = activityIds.reduce(
      (sum, activity) => sum + ACTIVITY_RATES[activity].down * counts[activity],
      0,
    );
    const up = activityIds.reduce(
      (sum, activity) => sum + ACTIVITY_RATES[activity].up * counts[activity],
      0,
    );
    const total = activityIds.reduce(
      (sum, activity) => sum + counts[activity],
      0,
    );

    const tierDown =
      calculator.querySelector<HTMLOutputElement>("[data-tier-down]");
    const tierUp =
      calculator.querySelector<HTMLOutputElement>("[data-tier-up]");
    const explanation = calculator.querySelector<HTMLElement>(
      "[data-needs-explanation]",
    );

    if (tierDown) tierDown.textContent = `${recommendation.tierDown} Mbps`;
    if (tierUp) tierUp.textContent = `${recommendation.tierUp} Mbps`;
    if (explanation) {
      explanation.textContent = total
        ? `Before headroom, this mix uses about ${formatter.format(down)} Mbps down and ${formatter.format(up)} Mbps up. With 25% headroom, aim for ${recommendation.tierDown} Mbps down and ${recommendation.tierUp} Mbps up.`
        : "Choose the activities that overlap. The calculator starts with a modest 25 Mbps down and 5 Mbps up, then rounds each direction to a common plan tier.";
    }
  };

  calculator.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest<HTMLButtonElement>(
      "[data-activity][data-change]",
    );
    const activity = button?.dataset.activity as ActivityId | undefined;
    const change = Number(button?.dataset.change);
    if (!button || !activity || !(activity in ACTIVITY_RATES) || !change)
      return;

    counts[activity] = Math.min(12, Math.max(0, counts[activity] + change));
    render();
  });

  render();
}
