# D&S Tournament Portal — Setup Guide

## Step 1: Create a Firebase Project (5 minutes)

1. Go to https://console.firebase.google.com
2. Click **Add project**
3. Name it: `deuce-smash-tournaments`
4. Disable Google Analytics (not needed) → **Create project**

---

## Step 2: Enable Realtime Database

1. In your Firebase project, click **Build** → **Realtime Database** in the left sidebar
2. Click **Create Database**
3. Choose region: **asia-south1 (Mumbai)** — closest to Pune
4. Start in **Test mode** (we'll secure it later) → **Enable**

---

## Step 3: Get your Firebase config

1. Click the **gear icon** (Project Settings) → **General** tab
2. Scroll down to **Your apps** → click the **</>** (Web) icon
3. Register app with nickname: `tournament-portal`
4. Copy the `firebaseConfig` object that appears — looks like:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "deuce-smash-tournaments.firebaseapp.com",
  databaseURL: "https://deuce-smash-tournaments-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "deuce-smash-tournaments",
  storageBucket: "deuce-smash-tournaments.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

---

## Step 4: Paste config into the tournament page

Open `tournaments/mexicano-oct-2026.html` and find the section marked:

```
// ─── FIREBASE CONFIG ─────────────────────────────────
// Replace these values after creating your Firebase project
```

Replace the placeholder values with your real config values.

---

## Step 5: Push to GitHub

```bash
git add tournaments/
git commit -m "Add tournament portal — Mexicano Oct 2026"
git push
```

Vercel auto-deploys in ~30 seconds.

---

## Step 6: Set Database Security Rules (after the event)

In Firebase → Realtime Database → **Rules**, replace with:

```json
{
  "rules": {
    "tournaments": {
      "$tournament": {
        ".read": true,
        ".write": false
      }
    }
  }
}
```

This makes scores publicly readable but write-protected after the event.

---

## URLs after deployment

| Page | URL |
|------|-----|
| Tournament hub | `https://deuceandsmash.com/tournaments/` |
| Live scoreboard | `https://deuceandsmash.com/tournaments/mexicano-oct-2026.html` |
| Admin (score entry) | Same URL — tap **Admin** button, enter PIN `062026` |

---

## Adding future tournaments

1. Copy `mexicano-oct-2026.html` → rename for new event
2. Update player names, dates, round config at top of file
3. Add an entry to the `TOURNAMENTS` array in `tournaments/index.html`
4. Push to GitHub

---

## Adding video highlights

In `mexicano-oct-2026.html`, find the `highlightsCard` section.
Replace the placeholder with:

```html
<div class="highlight-grid">
  <a href="YOUR_GOOGLE_DRIVE_LINK" target="_blank" class="highlight-item">
    <div class="highlight-thumb">▶</div>
    <div class="highlight-name">Nikhil A. — Best Moments</div>
  </a>
  <!-- Add more players -->
</div>
```

Or share a Google Drive folder link in the description — players can access their own clips.
