# Turzam AI

A premium AI assistant app for iOS and Android. Built with **React Native + Expo + TypeScript**, **Supabase** (login + database) and **Google Gemini** (the AI).

**Features:** streaming answers · 5 AI modes (Balanced, Deep Think, Creative, Coder, Tutor) · chat history with search · long-term memory you control · image upload (camera or library) · animated buttons with haptics · private per-user data.

## Where do my keys go?

| Key | Where it goes | Safe in the app? |
|---|---|---|
| Supabase **Project URL** | `.env` (copy of `.env.example`) | Yes |
| Supabase **anon public key** | `.env` | Yes (protected by Row Level Security) |
| **Gemini API key** | `supabase/.env`, then uploaded to Supabase as a secret (Step 5) | **Never** in the app |
| Supabase **service_role** key | **Nowhere.** Turzam never needs it. | Never |

`.env` and `supabase/.env` are in `.gitignore`, so GitHub never sees them.

## Setup (about 20 minutes)

You need: [Node.js LTS](https://nodejs.org), a free [Supabase](https://supabase.com) account, a Gemini key from [Google AI Studio](https://aistudio.google.com/apikey), and the **Expo Go** app on your phone.

**1. Install the app's packages** (PowerShell, inside the project folder)
```powershell
npm install
npx expo install --fix
```

**2. Create the database**
1. In Supabase click **New project** and wait until it is ready.
2. Open **SQL Editor → New query**, paste everything from `supabase/schema.sql`, click **Run**.
3. Optional, easier testing: **Authentication → Providers → Email** and turn **Confirm email** off.

**3. Put the Supabase keys in `.env`**
```powershell
copy .env.example .env
notepad .env
```
Paste the **Project URL** and **anon public** key from Supabase → **Project Settings → API**. Save.

**4. Put the Gemini key in `supabase/.env`**
```powershell
copy supabase\.env.example supabase\.env
notepad supabase\.env
```
Replace `PASTE-YOUR-GEMINI-API-KEY-HERE` with your key. Save.

**5. Upload the Gemini key and the backend to Supabase**
Your project ref is the part of your Supabase URL before `.supabase.co`.
```powershell
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase secrets set --env-file supabase/.env
npx supabase functions deploy chat
```

**6. Run the app**
```powershell
npx expo start -c
```
Scan the QR code with Expo Go (Android) or the Camera app (iPhone). Create an account and start chatting.

## How it works

```
Phone app ──(your login token)──> Supabase Edge Function "chat" ──(Gemini key)──> Gemini
    │                                     │
    └──────── Supabase database (RLS: every user only sees their own rows)
```

- `app/` screens: chat, sign-in, settings, memory.
- `src/` components, chat logic (`hooks/useChat.ts`), theme, modes.
- `supabase/schema.sql` tables, security rules, private image storage.
- `supabase/functions/chat/index.ts` the only code that touches the Gemini key.

Change the Gemini model any time with `GEMINI_MODEL` in `supabase/.env`, then repeat the `secrets set` command. No app update needed.

## Troubleshooting

- **"Almost ready" screen**: `.env` is missing or still has the placeholder values. Fix it, then `npx expo start -c`.
- **"The server has no GEMINI_API_KEY yet"**: redo Step 5.
- **"The AI service returned an error (4xx)"**: check the key and the model name in `supabase/.env`, then redo `secrets set`.
- **Cannot sign in right after sign-up**: confirm the email, or turn off **Confirm email** (Step 2.3).
- **Phone cannot find the app**: phone and computer must be on the same Wi‑Fi. Otherwise run `npx expo start --tunnel`.

## Publishing to the stores

```powershell
npm install -g eas-cli
eas login
eas build:configure
eas build --platform all
eas submit --platform all
```
Change `com.turzam.ai` in `app.json` to your own bundle id first.

## Known limits

- Deleting your account itself needs a server action with the service-role key; it is not included. Chats and memories can be deleted in the app.
- Per-user rate limits for Gemini are not included yet. Add them before a public launch.
