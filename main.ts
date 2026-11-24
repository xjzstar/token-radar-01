// Token Radar, model radar-3 (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or
// --input <file|dir>), scores every pre-token protocol with the fitted
// comparables model in lib/model.ts, writes the ranked board to
// /output/board.json, and copies this repository's dashboard/ and
// screenshots/ to /output. Last, it writes /output/dossier.json with the
// vendored make.fun library.
//
// The dashboard is a static page, no framework and no network:
// dashboard/index.html, dashboard/app.css and dashboard/app.js read
// /output/data.js, which this program writes from the same board.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot, SnapshotError } from './lib/model.ts';
import { buildDossier, DossierError } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. A flag left with no value fails loudly instead of silently falling back to a path the run never asked for. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0) {
    if (at + 1 >= process.argv.length) {
      process.stderr.write(`token radar: --${name} needs a value: pass --${name} <value>\n`);
      process.exit(2);
    }
    return process.argv[at + 1]!;
  }
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/** One clean line on stderr and the exit code the failure calls for; never a stack trace. */
function fail(message: string, code: 1 | 2): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
if (!statSync(inputFile).isFile() || statSync(inputFile).size === 0) {
  process.stderr.write(`token radar: ${inputFile} is not a snapshot file with content: point --input at the sealed snapshot.json\n`);
  process.exit(2);
}

const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

try {
  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    fail(`the model wrote a board the gate refuses: ${issue}`, 1);
  }
  if (!radar.self_audit.passed) {
    const failed = radar.self_audit.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`).join('; ');
    fail(`self-audit ${radar.self_audit.passed_count}/${radar.self_audit.total} passed: ${failed}`, 1);
  }

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));

  /** Copy one directory's regular files into `to`, skipping names that start with a dot. */
  function copyFiles(from: string, to: string): string[] {
    if (!existsSync(from)) return [];
    mkdirSync(to, { recursive: true });
    const copied: string[] = [];
    for (const name of readdirSync(from)) {
      if (name.startsWith('.')) continue;
      const path = join(from, name);
      if (!statSync(path).isFile()) continue;
      copyFileSync(path, join(to, name));
      copied.push(name);
    }
    return copied;
  }

  copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
  const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
  if (shots.length < 3) {
    fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`, 1);
  }
  for (const name of shots) {
    if (!IMAGE_NAME.test(name)) {
      fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
    }
    if (statSync(join(out, 'screenshots', name)).size === 0) {
      fail(`screenshots/${name}: the copied image holds no bytes, re-shoot it before handing in`, 1);
    }
  }

  // The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

  const validation = radar.validation;
  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
      `token radar: radar-3 ${validation !== null ? validation.model : 'no validation'} model, audit ${radar.audit.total} accounted for, self-audit ${radar.self_audit.passed_count}/${radar.self_audit.total} passed\n` +
      `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
  );
} catch (err) {
  if (err instanceof SnapshotError) fail(err.message, 2);
  if (err instanceof DossierError) fail(err.message, 1);
  fail(err instanceof Error ? err.message : String(err), 1);
}
