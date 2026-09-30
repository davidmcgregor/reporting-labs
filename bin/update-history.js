// Append a completed report's run information to a history file.
// Usage: node bin/update-history.js <report-folder> <history-file>

'use strict';
const fs = require('fs');
const path = require('path');

function usage(exit = 0) {
  console.log(
`reporting-labs update-history

  Refresh report.json and index.html with saved history plus the current run,
  then save the updated history file.

Usage:
  npx reporting-labs update-history <report-folder> <history-file> [--label <text>]

Arguments:
  <report-folder>       A folder that contains report.json.
  <history-file>        The history JSON file to update. It is created if missing.

Options:
  --label <text>        Label for the appended run, such as a CI build number.
  --help, -h            Show this message`);
  process.exit(exit);
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) usage(0);
  const positional = [];
  let label;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--label') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('-')) usage(1);
      label = argv[++i];
    }
    else if (arg.startsWith('-')) usage(1);
    else positional.push(arg);
  }
  if (positional.length !== 2) usage(1);
  return { reportDir: positional[0], historyFile: positional[1], label };
}

function outcomeCode(outcome) {
  if (outcome === 'passed') return 'p';
  if (outcome === 'flaky') return 'k';
  if (outcome === 'skipped') return 's';
  return 'f';
}

function historyEntry(data, label) {
  if (!data || typeof data !== 'object' || !data.stats || !Array.isArray(data.tests)) {
    throw new Error('report.json does not contain valid report data');
  }

  const tests = {};
  for (const test of data.tests) {
    const results = Array.isArray(test.results) ? test.results : [];
    const last = results[results.length - 1];
    tests[test.key] = [outcomeCode(test.outcome), Math.round(last?.duration ?? test.duration ?? 0)];
  }

  const stats = data.stats;
  const embeddedLabel = Array.isArray(data.env)
    ? data.env.find(e => e.k.toLowerCase() === 'ci')?.v ?? data.env.find(e => e.k.toLowerCase() === 'branch')?.v
    : undefined;
  return {
    time: data.startTime,
    duration: data.duration,
    passed: stats.passed ?? 0,
    failed: (stats.failed ?? 0) + (stats.timedOut ?? 0) + (stats.interrupted ?? 0),
    flaky: stats.flaky ?? 0,
    skipped: stats.skipped ?? 0,
    total: stats.total ?? data.tests.length,
    label: label ?? data.metadata?.build ?? embeddedLabel ?? data.metadata?.branch,
    tests,
  };
}

function updateHistory(reportDir, historyFile, label) {
  const reportPath = path.resolve(reportDir, 'report.json');
  const historyPath = path.resolve(historyFile);
  const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  let history = [];
  if (fs.existsSync(historyPath)) {
    history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    if (!Array.isArray(history)) throw new Error(`${historyPath} must contain a JSON array`);
  }

  const current = historyEntry(data, label);
  history.push(current);
  data.history = history;
  const { renderHtml } = require(path.resolve(__dirname, '..', 'dist', 'template.js'));
  const html = renderHtml(data);
  fs.writeFileSync(reportPath, JSON.stringify(data), 'utf8');
  fs.writeFileSync(path.resolve(reportDir, 'index.html'), html, 'utf8');

  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 1));
  console.log(`Updated ${path.relative(process.cwd(), historyPath)} with run from ${path.relative(process.cwd(), reportPath)}`);
}

module.exports = { historyEntry, parseArgs, updateHistory };

if (require.main === module) {
  const { reportDir, historyFile, label } = parseArgs(process.argv.slice(2));
  updateHistory(reportDir, historyFile, label);
}