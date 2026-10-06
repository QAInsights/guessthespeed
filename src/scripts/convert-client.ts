import {
  downloadSeconds,
  formatDuration,
  mbpsFromMBps,
  mbpsToMBps,
} from "../lib/convert";

const converter = document.querySelector<HTMLElement>("[data-mbps-converter]");

if (converter) {
  const mbpsInput =
    converter.querySelector<HTMLInputElement>("[data-mbps-value]");
  const mBpsInput = converter.querySelector<HTMLInputElement>(
    "[data-mbps-file-value]",
  );
  const gbpsOutput =
    converter.querySelector<HTMLOutputElement>("[data-gbps-output]");
  const conversionOutput = converter.querySelector<HTMLElement>(
    "[data-conversion-output]",
  );

  const formatNumber = (value: number): string =>
    new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 6,
      useGrouping: false,
    }).format(value);

  const updateConversion = (source: "mbps" | "mBps") => {
    const input = source === "mbps" ? mbpsInput : mBpsInput;
    const value = Number(input?.value);
    const mbps =
      source === "mbps" ? value : (mBpsInput && mbpsFromMBps(value)) || null;
    const mBps =
      source === "mBps" ? value : (mbpsInput && mbpsToMBps(value)) || null;

    if (!mbps || !mBps || !Number.isFinite(mbps) || !Number.isFinite(mBps)) {
      if (gbpsOutput) gbpsOutput.textContent = "Enter a positive speed";
      if (conversionOutput)
        conversionOutput.textContent =
          "Enter a speed greater than zero in either unit.";
      if (source === "mbps" && mBpsInput) mBpsInput.value = "";
      if (source === "mBps" && mbpsInput) mbpsInput.value = "";
      return;
    }

    if (source === "mbps" && mBpsInput) mBpsInput.value = formatNumber(mBps);
    if (source === "mBps" && mbpsInput) mbpsInput.value = formatNumber(mbps);
    if (gbpsOutput)
      gbpsOutput.textContent = `${formatNumber(mbps / 1000)} Gbps`;
    if (conversionOutput) {
      conversionOutput.textContent = `${formatNumber(mbps)} Mbps equals ${formatNumber(mBps)} MB/s or ${formatNumber(mbps / 1000)} Gbps.`;
    }
  };

  mbpsInput?.addEventListener("input", () => updateConversion("mbps"));
  mBpsInput?.addEventListener("input", () => updateConversion("mBps"));
  updateConversion("mbps");
}

const downloadCalculator = document.querySelector<HTMLElement>(
  "[data-download-calculator]",
);

if (downloadCalculator) {
  const sizeInput =
    downloadCalculator.querySelector<HTMLInputElement>("[data-file-size]");
  const unitInput =
    downloadCalculator.querySelector<HTMLSelectElement>("[data-file-unit]");
  const speedInput = downloadCalculator.querySelector<HTMLInputElement>(
    "[data-download-speed]",
  );
  const fullOutput =
    downloadCalculator.querySelector<HTMLOutputElement>("[data-time-full]");
  const realisticOutput = downloadCalculator.querySelector<HTMLOutputElement>(
    "[data-time-realistic]",
  );
  const summary = downloadCalculator.querySelector<HTMLElement>(
    "[data-download-summary]",
  );

  const renderDownloadTime = () => {
    const size = Number(sizeInput?.value);
    const speed = Number(speedInput?.value);
    const unit = unitInput?.value;
    const bytesPerUnit = unit === "GB" ? 1_000_000_000 : 1_000_000;
    const sizeBytes = size * bytesPerUnit;
    const atFullEfficiency = formatDuration(
      downloadSeconds(sizeBytes, speed) ?? Number.NaN,
    );
    const atNinetyPercent = formatDuration(
      downloadSeconds(sizeBytes, speed, 0.9) ?? Number.NaN,
    );

    if (!atFullEfficiency || !atNinetyPercent) {
      if (fullOutput)
        fullOutput.textContent = "Enter a positive size and speed";
      if (realisticOutput)
        realisticOutput.textContent = "Enter a positive size and speed";
      if (summary)
        summary.textContent =
          "Enter a file size and internet speed greater than zero.";
      return;
    }

    if (fullOutput) fullOutput.textContent = `About ${atFullEfficiency}`;
    if (realisticOutput)
      realisticOutput.textContent = `About ${atNinetyPercent}`;
    if (summary) {
      summary.textContent = `${size} ${unit} at ${speed} Mbps takes about ${atFullEfficiency} at 100% efficiency, or about ${atNinetyPercent} at 90%.`;
    }
  };

  sizeInput?.addEventListener("input", renderDownloadTime);
  unitInput?.addEventListener("change", renderDownloadTime);
  speedInput?.addEventListener("input", renderDownloadTime);
  renderDownloadTime();
}
