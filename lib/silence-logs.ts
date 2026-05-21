// lib/silence-logs.ts — quiet the Metro / device console.
//
// Imported at the very top of app/_layout.tsx so it patches the console before
// anything else runs.
//
// Two knobs:
//   1. SILENCE_ALL = true  → silences ALL console.log / .info / .debug.
//   2. SILENCE_ALL = false → only silences calls whose first arg starts with
//      one of the prefixes in SILENT_PREFIXES.
//
// console.warn and console.error are NEVER silenced — those usually carry
// real signal you want to see (deprecations, runtime errors, RN warnings).

const SILENCE_ALL = true;

const SILENT_PREFIXES: string[] = [
  '[Splash]',
  '[AppCheck]',
  '[Finix WebView]',
];

const origLog = console.log;
const origInfo = console.info;
const origDebug = console.debug;

function shouldSilence(args: any[]): boolean {
  if (SILENCE_ALL) return true;
  const first = String(args[0] ?? '');
  return SILENT_PREFIXES.some((p) => first.includes(p));
}

console.log = (...args: any[]) => {
  if (shouldSilence(args)) return;
  origLog(...args);
};
console.info = (...args: any[]) => {
  if (shouldSilence(args)) return;
  origInfo(...args);
};
console.debug = (...args: any[]) => {
  if (shouldSilence(args)) return;
  origDebug(...args);
};
