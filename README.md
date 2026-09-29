# AutoDM 🚀 — Instagram Comment-to-DM SaaS Platform

A production-ready, multi-tenant Instagram Auto-DM automation platform built on a full-stack **React 19 + Express + Vite + Tailwind CSS + Firebase (Firestore & Auth) + Meta Graph API** architecture.

When followers comment targeted trigger keywords on your Instagram Reels or Posts (e.g. `"GUIDE"`, `"LINK"`, `"VIP"`), AutoDM instantly and automatically delivers a personalized Direct Message with your link, lead magnet, or offer.

---

## ⚡ Key Features

- **Google Authentication & Multi-Tenant Session**:
  - Secure Firebase Authentication (`signInWithPopup`).
  - Automatic profile sync to `/users/{userId}` in Cloud Firestore.
  - Zero-trust Attribute-Based Access Control (ABAC) Firestore security rules.
- **Instagram Graph API Integration**:
  - Verified connection to Instagram Business & Creator accounts.
  - Live retrieval of Instagram account details, Reels, and Posts.
- **Comment-to-DM Funnel Engine**:
  - Create keyword triggers targeting specific Reels/Posts or all posts globally.
  - Dynamic message templating with `{username}` personalization.
  - Optional automated public reply on the triggering comment (e.g., *"Sent you a DM! Check your inbox 📬"*).
  - One-click rule activation/pause toggles and trigger counters.
- **Meta Webhook Ingestion**:
  - Fully compliant with Meta's Webhook verification handshake (`hub.challenge`).
  - Real-time event listener for Instagram comments (`object: instagram`, `field: comments`).
- **Interactive Test Simulator**:
  - Simulate incoming follower comments on any Reel or Post directly from the dashboard to verify keyword matching and message composition.
- **Live Event Stream**:
  - Real-time audit log of incoming comments, matched funnels, and automated DMs sent.

---

## 🏗️ Architecture & Tech Stack

| Component | Technology |
|---|---|
| **Frontend** | React 19, Vite, Tailwind CSS v4, Lucide Icons |
| **Backend** | Express 4, Node.js (via `tsx` / `server.ts`) |
| **Database & Auth** | Google Cloud Firestore & Firebase Auth |
| **Social API** | Meta Graph API (Instagram for Business) |
| **Language** | TypeScript / JavaScript |

---

## 🚀 Quick Start (Local Setup)

### 1. Clone the repository
```bash
git clone https://github.com/your-username/autodm-instagram-saas.git
cd autodm-instagram-saas
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Create your local environment file:
```bash
cp .env.example .env
```
Populate `.env` with your credentials:
```env
PORT=3000
APP_URL="http://localhost:3000"

# Firebase Client SDK Configuration
VITE_FIREBASE_API_KEY="AIzaSy..."
VITE_FIREBASE_AUTH_DOMAIN="your-app.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-app"
VITE_FIREBASE_STORAGE_BUCKET="your-app.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="123456789"
VITE_FIREBASE_APP_ID="1:123456789:web:abcdef"
VITE_FIREBASE_DATABASE_ID="(default)"

# Meta for Developers / Instagram Graph API
INSTAGRAM_APP_ID="1097121733196692"
INSTAGRAM_APP_SECRET="your_meta_app_secret"
INSTAGRAM_ACCESS_TOKEN="your_instagram_access_token"
INSTAGRAM_WEBHOOK_VERIFY_TOKEN="auto_dm_webhook_secret_2026"
```

### 4. Run the development server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🌐 Meta for Developers Webhook Setup

To receive real-time Instagram comments when you publish content:

1. Log in to [Meta for Developers](https://developers.facebook.com/).
2. Select your App (or create a Business App with **Instagram Graph API**).
3. Under **App Dashboard &rarr; Webhooks**, select **Instagram** from the dropdown.
4. Click **Edit Subscription**:
   - **Callback URL**: `https://<YOUR_DEPLOYED_DOMAIN>/api/webhook/instagram`
   - **Verify Token**: Your configured verify token (e.g. `auto_dm_webhook_secret_2026`).
5. Click **Verify and Save**.
6. Subscribe to the following Webhook fields:
   - `comments`
   - `messages`

---

## 📦 Deployment Guide (GitHub & Cloud)

### Option A: Render / Railway / Fly.io / Heroku (Full-Stack Node Service)
This application includes a unified Express + Vite server (`server.ts`).

1. Link your GitHub repository in Render, Railway, or Fly.io.
2. Configure Build & Start settings:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start` (or `npx tsx server.ts`)
3. Set your Environment Variables in the platform's dashboard from `.env.example`.

### Option B: Docker Container
A standard multi-stage Dockerfile:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
EXPOSE 3000
CMD ["npx", "tsx", "server.ts"]
```

---

## 🔒 Security & Firestore Rules

The database security rules in `firestore.rules` enforce zero-trust isolation:
- User accounts (`/users/{userId}`) can only be read, created, or updated by the authenticated document owner (`request.auth.uid == userId`).
- Strict schema enforcement prevents ghost fields and payload tampering.
- Client-side blanket reads and user directory listings are strictly blocked.

To deploy or update rules via Firebase CLI:
```bash
firebase deploy --only firestore:rules
```

---

## 📄 License
Apache-2.0
