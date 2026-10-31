// Checks that your secret files are filled in, without ever printing a secret.
//
//   npm run check:env       checks .env and supabase/.env on your computer
//   npm run check:secrets   scans the files tracked by git for keys that should never be committed (used in CI)
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function parse(file) {
  const out = {};
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
const placeholder = (v) => !v || /PASTE|YOUR-|^x+$/i.test(v);

if (process.argv.includes('--secrets')) {
  // Key shapes that must never be in the repository.
  const patterns = [
    [/AIza[0-9A-Za-z_-]{35}/, 'a Google API key'],
    [/\bsk-ant-[A-Za-z0-9_-]{20,}/, 'an Anthropic key'],
    [/\bsk-(proj-)?[A-Za-z0-9_-]{32,}/, 'an OpenAI key'],
    [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'a JWT (a Supabase key?)'],
  ];
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  let bad = 0;
  for (const f of files) {
    if (/\.(png|jpg|jpeg|ttf|otf|lock)$|package-lock\.json$/.test(f)) continue;
    let text;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    for (const [re, what] of patterns) {
      if (re.test(text)) {
        console.error(`Possible secret in ${f}: looks like ${what}.`);
        bad++;
      }
    }
    if (/^\s*(SUPABASE_SERVICE_ROLE_KEY|service_role)\s*=\s*\S+/im.test(text)) {
      console.error(`Possible service-role key assignment in ${f}.`);
      bad++;
    }
  }
  if (bad) process.exit(1);
  console.log(`Scanned ${files.length} tracked files: no keys found.`);
  process.exit(0);
}

let problems = 0;
const say = (ok, msg) => {
  console.log(`${ok ? 'OK   ' : 'FIX  '} ${msg}`);
  if (!ok) problems++;
};

// 1) .env, read by the app. Only the two Supabase values belong here.
if (!existsSync('.env')) say(false, '.env is missing. Run: copy .env.example .env');
else {
  const e = parse('.env');
  say(/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(e.EXPO_PUBLIC_SUPABASE_URL ?? ''), '.env: EXPO_PUBLIC_SUPABASE_URL is your Project URL (https://xxxx.supabase.co)');
  say(!placeholder(e.EXPO_PUBLIC_SUPABASE_ANON_KEY), '.env: EXPO_PUBLIC_SUPABASE_ANON_KEY is filled in');
  const leaked = Object.keys(e).filter((k) => /GEMINI|OPENAI|ANTHROPIC|SERVICE_ROLE/i.test(k));
  say(!leaked.length, `.env contains no AI or service-role keys${leaked.length ? ` (remove: ${leaked.join(', ')})` : ''}`);
  // the anon key is a JWT; its role must be "anon", never "service_role"
  try {
    const role = JSON.parse(Buffer.from((e.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').split('.')[1] ?? '', 'base64url').toString()).role;
    if (role) say(role === 'anon', `.env: the key is the "anon" key${role === 'anon' ? '' : ` (it is "${role}": use the anon public key instead!)`}`);
  } catch {
    // newer "publishable" keys are not JWTs; nothing to check
  }
}

// 2) supabase/.env, uploaded to the server with "supabase secrets set"
if (!existsSync('supabase/.env')) say(false, 'supabase/.env is missing. Run: copy supabase\\.env.example supabase\\.env');
else {
  const s = parse('supabase/.env');
  say(!placeholder(s.GEMINI_API_KEY), 'supabase/.env: GEMINI_API_KEY is filled in (required)');
  for (const [k, name] of [['OPENAI_API_KEY', 'ChatGPT'], ['ANTHROPIC_API_KEY', 'Claude']]) {
    console.log(`INFO  ${name} is ${placeholder(s[k]) ? 'off (no key set, that is fine)' : 'on'}`);
  }
  const reserved = Object.keys(s).filter((k) => k.startsWith('SUPABASE_'));
  say(!reserved.length, `supabase/.env has no SUPABASE_* names${reserved.length ? ` (Supabase refuses these; remove: ${reserved.join(', ')})` : ''}`);
}

console.log(problems ? `\n${problems} thing(s) to fix.` : '\nAll secret files look right. Values were not printed.');
process.exit(problems ? 1 : 0);
