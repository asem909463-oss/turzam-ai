// Pins every dependency in package.json to the exact version that is installed in node_modules.
//
//   npm run pin          rewrites package.json (run after "npm install" and "npx expo install --fix")
//   npm run check:pinned only checks; exits with an error if something is not exact or there is no lockfile
//
// No dependencies, works on Windows, macOS and Linux.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const check = process.argv.includes('--check');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const exact = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const loose = [];
let changed = 0;

for (const section of ['dependencies', 'devDependencies']) {
  for (const [name, spec] of Object.entries(pkg[section] ?? {})) {
    if (exact.test(spec)) continue;
    if (check) {
      loose.push(`${name}@${spec}`);
      continue;
    }
    const file = `node_modules/${name}/package.json`;
    if (!existsSync(file)) {
      console.error(`Missing ${name}. Run "npm install" first.`);
      process.exit(1);
    }
    pkg[section][name] = JSON.parse(readFileSync(file, 'utf8')).version;
    changed++;
  }
}

if (check) {
  let bad = false;
  if (loose.length) {
    console.error(`Not pinned to an exact version (${loose.length}):\n  ${loose.join('\n  ')}\nFix: npm install, then npx expo install --fix, then npm run pin`);
    bad = true;
  }
  if (!existsSync('package-lock.json')) {
    console.error('No package-lock.json. Run "npm install" and commit the file it creates.');
    bad = true;
  }
  if (bad) process.exit(1);
  console.log('All dependencies are pinned and a lockfile exists.');
} else {
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Pinned ${changed} dependencies. Now commit package.json and package-lock.json.`);
}
