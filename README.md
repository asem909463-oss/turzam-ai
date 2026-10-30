# Turzam AI

**The AI for business & founders.** Also built for creativity.

React Native + Expo + TypeScript app for iOS and Android. Supabase handles login and data. The AI runs on a small server function, so **no AI key is ever inside the app**.

## What it does

- **Founder mode** (default): strategy, pitch, pricing, outreach, hiring, operations. Plus Creative, Balanced, Deep Think, Coder and Tutor modes.
- **Attach images, PDFs and text files** (txt, md, csv, json, code). The AI reads them and answers from what is inside.
- **Chat tools:** streaming answers, stop, regenerate, copy, rename, delete, search (titles and message text), suggested prompts, tappable follow-up ideas.
- **Memory** you control: remembers lasting facts (your company, goals) and lets you edit or clear them.
- **Design:** light / dark / system theme, 6 accent colours, animated logo, "thinking" star, springy buttons with haptics, toasts.
- **Voice conversations:** tap the mic, talk, Turzam answers out loud and listens again (hands-free). Speech to text runs on the server with your Gemini key; the spoken answer uses your phone's built-in voice (free).
- **Web search with sources:** the globe button turns it on. Answers come with clickable source links (uses Gemini's Google Search grounding, same Gemini key).
- **Personalities:** Professional, Analyst, Creative, Teacher, Entrepreneur. They combine with any mode.
- **Custom instructions** (Settings): your standing rules for how Turzam answers.
- **Organise:** pin chats, folders, archive, search. **Export** any chat to PDF, Markdown or text.
- **Image understanding:** multi-image, tap-to-zoom, quick actions (Describe, Extract text, Explain chart, Review design, Compare).
- **Models:** Gemini, ChatGPT (OpenAI) and Claude (Anthropic). The app shows each one as **Connected** only when its key is set on the server. Gemini is required; the other two are optional.

## Where do my keys go?

| Key | Where it goes | Safe in the app? |
|---|---|---|
| Supabase **Project URL** | `.env` (copy of `.env.example`) | Yes |
| Supabase **anon public key** | `.env` | Yes (protected by Row Level Security) |
| **Gemini API key** (required) | `supabase/.env`, uploaded in Step 5 | **Never** in the app |
| OpenAI key (optional, enables ChatGPT) | `supabase/.env`, uploaded in Step 5 | **Never** in the app |
| Anthropic key (optional, enables Claude) | `supabase/.env`, uploaded in Step 5 | **Never** in the app |
| Supabase **service_role** key | **Nowhere.** Turzam never needs it. | Never |

`.env` and `supabase/.env` are in `.gitignore`, so GitHub never sees them.

## Setup (about 20 minutes)

You need: [Node.js LTS](https://nodejs.org), a free [Supabase](https://supabase.com) account, a Gemini key from [Google AI Studio](https://aistudio.google.com/apikey), and the **Expo Go** app on your phone.

**1. Install the app's packages** (PowerShell, inside the project folder)
```powershell
npm install
npx expo install --fix
```

**2. Create or update the database**
1. In Supabase click **New project** and wait until it is ready.
2. Open **SQL Editor → New query**, paste everything from `supabase/schema.sql`, click **Run**.
   Already ran an older version? Run it again. It is safe to repeat and adds the new columns and the file storage.
3. Optional, easier testing: **Authentication → Providers → Email** and turn **Confirm email** off.

**3. Put the Supabase keys in `.env`**
```powershell
copy .env.example .env
notepad .env
```
Paste the **Project URL** and **anon public** key from Supabase → **Project Settings → API**. Save.

**4. Put the AI key(s) in `supabase/.env`**
```powershell
copy supabase\.env.example supabase\.env
notepad supabase\.env
```
Replace `PASTE-YOUR-GEMINI-API-KEY-HERE` with your Gemini key. To turn on ChatGPT or Claude, remove the `#` in front of its line and paste the key. Save.

**5. Upload the keys and the backend to Supabase**
Your project ref is the part of your Supabase URL before `.supabase.co`.
```powershell
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase secrets set --env-file supabase/.env
npx supabase functions deploy chat
```
Added a key later? Repeat only the `secrets set` line, then reopen the app.

**6. Run the app**
```powershell
npx expo start -c
```
Scan the QR code with Expo Go (Android) or the Camera app (iPhone). Create an account and start chatting.

## How it works

```
Phone app ──(your login token)──> Supabase Edge Function "chat" ──(server-side keys)──> Gemini / ChatGPT / Claude
    │                                     │
    └── private file storage + database (Row Level Security: every user only sees their own rows)
```

- `app/` screens: chat, sign-in, settings (with About), memory.
- `src/` components, chat logic (`hooks/useChat.ts`), theme, modes, attachments.
- `supabase/schema.sql` tables, security rules, private file storage.
- `supabase/functions/chat/index.ts` the only code that touches AI keys. It reads attached files with the user's own permission, so nobody can read someone else's files.

Models can be changed any time with `GEMINI_MODEL`, `OPENAI_MODEL`, `ANTHROPIC_MODEL` in `supabase/.env`, then repeat the `secrets set` command. No app update needed.

## Extra keys and costs (v1.2)

No new keys are needed. Everything new runs on the **Gemini key you already have**:

| Feature | Needs | Cost |
|---|---|---|
| Web search + sources | Gemini key | Google bills Search grounding separately from normal tokens once you pass the free daily allowance (see Google AI pricing). Search is off unless the user turns it on. |
| Voice input (speech to text) | Gemini key | Normal Gemini audio token pricing. |
| Spoken answers | Nothing | Free, uses the phone's own voice. |
| PDF / Markdown / text export | Nothing | Free, made on the phone. |

Search and voice input are **Gemini only**. If you only connect ChatGPT or Claude, those two buttons say they need the Gemini key. A natural-sounding cloud voice (OpenAI/ElevenLabs/Google TTS) would need a new paid key and is not included.

**After updating:** run the new `supabase/schema.sql` again, redeploy with `npx supabase functions deploy chat`, then `npm install` and `npx expo install --fix`. Voice and export use native modules (expo-audio, expo-speech, expo-print, expo-sharing), which are included in Expo Go, but microphone permission text is set in `app.json`, so rebuild if you use a custom build.

## Attachments

Up to 4 files per message, 10 MB each. Photos are sent at high quality and you can pick several at once. Supported: images, PDF, and text-like files (txt, md, csv, json, xml, html, code). Word and Excel files are not supported yet; export them to PDF or CSV first.

## Troubleshooting

- **"Almost ready" screen**: `.env` is missing or still has placeholder values. Fix it, then `npx expo start -c`.
- **"The server has no AI key yet"**: redo Step 5.
- **"The chat backend is not deployed yet"**: run `npx supabase functions deploy chat`.
- **"...returned an error (4xx)"**: check that provider's key and model name in `supabase/.env`, then redo `secrets set`.
- **"Could not save" in Settings, or file upload fails**: run the latest `supabase/schema.sql` (Step 2).
- **ChatGPT or Claude shows "Not connected"**: its key is not set on the server yet (Step 4 and 5).
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

- Deleting your account itself needs a server action with the service-role key; it is not included. Chats, files and memories can be deleted in the app.
- Voice and search have no per-user limits yet, so add rate limits before a public launch (each voice turn and each search costs money).
- Voice replies are read in the phone's voice for the chosen language; the app cannot detect the answer's language, so set the voice language in Settings if you chat in more than one.
- Web-search sources come as Google redirect links; they open the real page.
- Per-user rate limits for AI usage are not included yet. Add them before a public launch.
- In-app toasts are included; push notifications are not.
