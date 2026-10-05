# Fit Logic

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
