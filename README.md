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
- **Project workspaces:** keep project chats together with workspace instructions and up to 6 private reference files (images, PDFs and text). Existing chats remain in history if a project is deleted.
- **Custom instructions** (Settings): your standing rules for how Turzam answers.
- **Organise:** pin chats, folders, archive, search. **Export** any chat to PDF, Markdown or text.
- **Image understanding:** multi-image, tap-to-zoom, quick actions (Describe, Extract text, Explain chart, Review design, Compare).
- **Models:** Gemini, ChatGPT (OpenAI) and Claude (Anthropic). The app shows each one as **Connected** only when its key is set on the server. Gemini is required; the other two are optional.
- **App reviews:** after 5 successful answers, a tasteful one-time-at-a-time prompt can open Apple’s or Google’s official in-app rating flow. Settings also includes Rate Turzam AI. The operating system decides whether to show its review sheet.
- **Usage protection:** per-user limits on the server (see "Limits, costs and safety"), counted in the database and impossible to raise from the app.

## Where do my keys go?

| Key | Where it goes | Safe in the app? |
|---|---|---|
| Supabase **Project URL** | `.env` (copy of `.env.example`) | Yes |
| Supabase **anon public key** | `.env` | Yes (protected by Row Level Security) |
| **Gemini API key** (required) | `supabase/.env`, uploaded in Step 5 | **Never** in the app |
| OpenAI key (optional, enables ChatGPT) | `supabase/.env`, uploaded in Step 5 | **Never** in the app |
| Anthropic key (optional, enables Claude) | `supabase/.env`, uploaded in Step 5 | **Never** in the app |
| Supabase **service_role** key | **You never paste it anywhere**: not in `.env`, not in `supabase/.env`, not in GitHub, not in the app. Supabase provides it to trusted Edge Functions at runtime. The chat function uses it only for server-side quota checks; `delete-account` uses it for confirmed file/account deletion. | Never |

**Only two places ever hold keys on your computer:**

| File | Holds | Created with |
|---|---|---|
| `.env` (project folder) | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `copy .env.example .env` |
| `supabase/.env` | `GEMINI_API_KEY` (required), `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (optional), optional limit settings | `copy supabase\.env.example supabase\.env` |

Both are in `.gitignore`, so GitHub never sees them. After filling them in, run `npm run check:env`: it tells you exactly what is missing or in the wrong file (for example an AI key pasted into `.env`, or the service-role key used by mistake) and never prints a secret. `npm run check:secrets` scans the files git tracks for keys, and CI runs it on every push.

## Setup (about 20 minutes)

You need: [Node.js LTS](https://nodejs.org), a free [Supabase](https://supabase.com) account, a Gemini key from [Google AI Studio](https://aistudio.google.com/apikey), and the **Expo Go** app on your phone.

**1. Install the app's packages** (PowerShell, inside the project folder)
```powershell
npm ci
npx expo install --check
```

**2. Create or update the database**
1. In Supabase click **New project** and wait until it is ready.
2. Open **SQL Editor → New query**, paste everything from `supabase/schema.sql`, click **Run**.
   Already ran an older version? Run the latest file again. It is safe to repeat; it adds new schema objects, revokes direct client access to `consume_quota`, and clears only invalid cross-user folder links (the chats themselves are kept).
3. Only while developing: **Authentication → Providers → Email**, turn **Confirm email** off so test accounts can sign in at once. Turn it back **on** before real users arrive (see "Development vs production" below).

**3. Put the Supabase keys in `.env`**
```powershell
copy .env.example .env
notepad .env
```
Paste the **Project URL** and **anon public** key from Supabase → **Project Settings → API**. Save. (Never the `service_role` key.)

**4. Put the AI key(s) in `supabase/.env`**
```powershell
copy supabase\.env.example supabase\.env
notepad supabase\.env
```
Replace `PASTE-YOUR-GEMINI-API-KEY-HERE` with your Gemini key. To turn on ChatGPT or Claude, remove the `#` in front of its line and paste the key. Save. Then check both files:
```powershell
npm run check:env
```

**5. Upload the keys and the backend to Supabase**
Your project ref is the part of your Supabase URL before `.supabase.co`.
```powershell
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase secrets set --env-file supabase/.env
npx supabase functions deploy chat
npx supabase functions deploy delete-account
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

- `app/` screens: chat, sign-in, settings (with About), memory, and project workspaces.
- `src/` components, chat logic (`hooks/useChat.ts`), theme, modes, attachments.
- `supabase/schema.sql` tables, security rules, private file storage.
- `supabase/functions/chat/index.ts` is the only code that touches AI provider keys (shared limits and checks are in `supabase/functions/_shared/limits.ts`). Trusted Edge Functions use the service-role key only server-side; chat uses it for the quota RPC, while account deletion uses it for confirmed cleanup. Chat reads attachments with the user's own token, so it cannot read another user's files.

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

**When you choose to roll out an update:** run the latest `supabase/schema.sql` first (it adds project tables, usage limits and folders without deleting existing chats), then deploy the updated `chat` and `delete-account` functions, install with `npm ci`, and verify with `npx expo install --check`. Voice, export and store reviews use Expo native modules; microphone permission text is set in `app.json`, so a custom native build may be required for app changes.

## Development vs production settings

| Setting | While you develop | Before real users |
|---|---|---|
| **Confirm email** (Supabase → Authentication → Providers → Email) | **Off** is fine: test accounts sign in immediately | **On**, so nobody can sign up with someone else's address |
| **Email sending** (Authentication → SMTP) | Supabase's built-in mailer is fine; it only sends a few emails per hour | Set your **own SMTP provider**; the built-in one is not meant for production |
| **CAPTCHA** (Authentication → Attack Protection) | Off | **On** (hCaptcha or Turnstile) to slow down fake accounts |
| **Total daily caps** (`GLOBAL_CHAT_PER_DAY`, `GLOBAL_SEARCH_PER_DAY`, `GLOBAL_TRANSCRIBE_PER_DAY` in `supabase/.env`) | Not needed | **Set them**: a hard stop for the whole app, whatever accounts exist |
| **Per-user limits** (`LIMIT_*`) | Defaults | Review them against your AI budget |
| **Gemini key** | Any key | A key with a **spending cap** in Google AI Studio / Cloud billing |
| **Site URL and redirect URLs** (Authentication → URL Configuration) | Expo Go URLs | Your real app scheme (`turzam://`) |
| **Bundle id** (`app.json`) | `com.turzam.ai` | Your own id |

If you change `supabase/.env`, run `npx supabase secrets set --env-file supabase/.env` again.

## Limits, costs and safety (v1.3)

All of this is enforced **on the server**, so a modified app cannot get around it.

- **Per-user rate limits** (counted in the database, function `consume_quota`): chat 12 per minute and 150 per day, web search 6 per minute and 40 per day, titles/memory/ideas 30 per minute and 400 per day, voice 10 per minute and 100 per day. Only trusted Edge Functions can execute the quota RPC; API roles cannot manipulate counters or consume the global cap directly. Change limits with `LIMIT_CHAT_PER_DAY` and similar secrets (see `supabase/.env.example`). If you forget to run the latest `schema.sql`, the server refuses requests instead of running without limits.
- **Total daily cap (optional):** `GLOBAL_CHAT_PER_DAY` and similar secrets stop the whole app at a daily number of calls, whoever makes them. Off until you set it. The check-then-count runs under a database lock per action type, so many users hitting it in the same instant cannot push it past the cap (proved by `npm run test:quota`).
- **Input checks:** messages up to 12,000 characters, at most 40 messages and 120,000 characters of history per request, unknown modes/personalities ignored, malformed files dropped.
- **Answer size:** `MAX_OUTPUT_TOKENS` (default 4096). Gemini 3.x counts its thinking in the same limit, so the server adds room for it. Gemini thinking defaults to `low` (cheapest); set `GEMINI_THINKING_LEVEL=medium` for better answers at higher cost. Gemini 3.x is run at its default temperature, as Google recommends.
- **Stop really stops:** when you press Stop (or the connection drops) the server cancels the request to the AI provider, so it stops generating and billing. Titles, memory and follow-up ideas are skipped for stopped answers.
- **Timeouts:** 30 s for the AI to start, 45 s of silence, 2 minutes total. Temporary errors (429/5xx) are retried once.
- **Auto mode:** tries each connected AI in order and moves on to the next if one fails before answering. If you pick a specific AI, the app does not switch silently; it tells you what went wrong. Provider error details stay in the server log, not in the app.
- **Files:** 4 per message, 10 MB each, 18 MB per message, everywhere (app, server and storage bucket). Deleting a chat or all chats removes every file (all pages, including files whose chat is gone); if files cannot be removed the chat is kept so you can retry. A failed upload removes the files that already went up.
- **Delete account** (Settings): asks for the word DELETE and your password, checks the password on the server, removes all files, then deletes the account; chats, memories, folders and usage records go with it. Limited to 3 attempts per minute.

## Checks for developers

```powershell
npm run check          # type-check the app + run the Edge Function tests
npm run check:edge     # type-check and lint the Edge Functions (needs Deno: https://deno.com)
npm run check:pinned   # fails if a dependency is not pinned or there is no lockfile
npm audit --audit-level=moderate # fail on moderate-or-higher npm advisories
npm run check:env      # are .env and supabase/.env filled in correctly (prints no secrets)
npm run check:secrets  # scans the files git tracks for keys
npm run test:quota     # quota abuse, limits under concurrency and folder RLS (needs PostgreSQL)
```
`.github/workflows/ci.yml` runs app checks, npm audit, Edge Function tests/type-check/lint, secret scanning and PostgreSQL regressions on pushes to any branch and pull requests.

### Dependencies and lockfile

All direct dependencies are exact-pinned and `package-lock.json` is generated by npm from the public registry. Use `npm ci` for clean installs. When adding an Expo package, use `npx expo install <package>`, run `npm run pin` to keep direct versions exact, regenerate the lock with `npm install`, and run `npm run check:pinned`, `npm audit --audit-level=moderate` and `npm run check` before committing.

## Attachments

Up to 4 files per message, 10 MB each (18 MB per message). Photos are sent at high quality and you can pick several at once. Supported: images, PDF, and text-like files (txt, md, csv, json, xml, html, code). Word and Excel files are not supported yet; export them to PDF or CSV first.

## Troubleshooting

- **"Almost ready" screen**: `.env` is missing or still has placeholder values. Fix it, then `npx expo start -c`.
- **"The server has no AI key yet"**: redo Step 5.
- **"The chat backend is not deployed yet"**: run `npx supabase functions deploy chat`.
- **"...returned an error (4xx)"**: check that provider's key and model name in `supabase/.env`, then redo `secrets set`.
- **"Could not save" in Settings, or file upload fails**: run the latest `supabase/schema.sql` (Step 2).
- **ChatGPT or Claude shows "Not connected"**: its key is not set on the server yet (Step 4 and 5).
- **Cannot sign in right after sign-up**: confirm the email. During development only, you can turn off **Confirm email** (Step 2.3).
- **Not sure the key files are right**: run `npm run check:env`.
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

- Per-user quotas do not stop someone creating many accounts. Set `GLOBAL_CHAT_PER_DAY` (and the SEARCH / TRANSCRIBE ones) in `supabase/.env` as a total daily cap, turn on **Confirm email** in Supabase (Authentication, Providers, Email), and enable CAPTCHA under Authentication, Attack Protection before a public launch.
- Account deletion removes your data in this app's Supabase project. It does not delete anything already sent to Google, OpenAI or Anthropic (see their own policies).
- Web-search sources come as Google redirect links; they open the real page.
- Voice replies use the phone's voice for the language chosen in Settings; the app cannot detect the answer's language.
- In-app toasts are included; push notifications are not.
