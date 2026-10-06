# Guess the Speed

A family game-night app for guessing download and upload speed before running a real internet speed test. Closest guesses earn points, and the local scoreboard keeps the game going across rounds.

## Local development

```sh
npm install
npm run dev
```

Useful commands:

```sh
npm run check
npm test
npm run format
npm run build
npm run preview
```

Add players, pass the device around for private guesses, and run a real Cloudflare speed test. Append `?mock=1` to the URL to use the short simulated test while developing or capturing screenshots.

## Deploy

Deploy with Cloudflare Workers Builds. `wrangler.jsonc` runs `npm run build` before `npx wrangler deploy` and uploads `dist` as static assets, so the dashboard build command can stay empty.

To enable optional Cloudflare Web Analytics, configure `PUBLIC_CF_BEACON_TOKEN` in the Cloudflare build environment. Without the token, the analytics beacon is not included.

## Privacy

Game data is stored in this browser's local storage. The Cloudflare speed test engine collects aggregated, anonymous test results. See [the privacy page](https://guessthespeed.com/privacy).
