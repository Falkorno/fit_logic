# Pulse

A deterministic weekly fitness planner for balancing running, cycling, strength work, availability, recovery, and completed training.

## Development

```bash
npm install
npm run dev
```

The local app listens on `http://127.0.0.1:43817`.

## Checks

```bash
npm test
npm run build
```

## Mini PC deployment

1. Copy `.env.example` to `.env` and fill in the Firebase web-app values.
2. Build and start the production container:

```bash
docker compose up -d --build
```

The container binds only to `127.0.0.1:43817`; it is not exposed directly to the LAN or internet. Point a Cloudflare Tunnel public hostname at `http://127.0.0.1:43817`. `cloudflared.example.yml` is provided for locally-managed tunnels, although Cloudflare currently recommends remotely-managed tunnels for most deployments.

## Firebase

The Firebase SDK, Google sign-in helpers, Firestore state adapter, and owner-only security rules are included. Before enabling sync:

1. Register a Firebase web app and populate the `VITE_FIREBASE_*` values.
2. Enable Google as a Firebase Authentication provider.
3. Add the final `jamestd.co.uk` hostname to Firebase Authentication's authorized domains.
4. Create Firestore and deploy the included rules with `firebase deploy --only firestore:rules`.
5. Connect the prepared auth and state adapter to the UI once the Firebase project values are available.

Do not deploy permissive Firestore rules. Web Firebase configuration values identify the project; Authentication and Firestore Security Rules enforce access.
## Strava integration

Pulse uses the same secure pattern as the tracked project: OAuth secrets and refresh tokens stay in a backend Worker, Firebase ID tokens authenticate API calls, and only normalized activities reach the browser.

For the local Tailscale test environment:

- App: `https://desktop-tlqdo0m.tail3f359d.ts.net:8443`
- Strava API: `https://desktop-tlqdo0m.tail3f359d.ts.net:8444`
- Local API process: `npm run worker:dev` (port 8790)

Copy `.env.example` to `.env` and `worker/.dev.vars.example` to `worker/.dev.vars`. Add the Firebase web values to `.env`, and add `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, and the matching `FIREBASE_API_KEY` to `worker/.dev.vars`. These files are git-ignored.

Create a separate Strava API application for Pulse so the tracked app keeps its existing callback domain. In the new application, set the callback domain to `desktop-tlqdo0m.tail3f359d.ts.net`. The callback URL used by the local Worker is `https://desktop-tlqdo0m.tail3f359d.ts.net:8444/api/strava/callback`.

Imported runs, rides, and strength activities are matched to an uncompleted workout on the same date using distance or duration. A confident match completes the planned workout and records the actual result; otherwise the completed Strava activity is added to that historical day.
