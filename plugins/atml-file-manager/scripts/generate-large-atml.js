#!/usr/bin/env node
/*
 * Generate a large synthetic ATML TestResults file to stress-test the viewer.
 *
 * Usage:
 *   node scripts/generate-large-atml.js [steps] [outfile]
 *   node scripts/generate-large-atml.js 100000 test-data/large-100k.atml
 *
 * Produces a namespace-agnostic IEEE-1671 <tr:TestResults> document with a
 * single <tr:ResultSet> containing `steps` flat <tr:Test> steps. Each step has
 * an <tr:Outcome> and a limit-bearing numeric <tr:TestResult> measurement so
 * the viewer exercises its measurement/limit rendering path. Written with a
 * streamed writer (with backpressure) so memory stays flat regardless of size.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const steps = Math.max(1, parseInt(process.argv[2], 10) || 100000);
const outArg = process.argv[3] || path.join('test-data', `large-${steps}.atml`);
const outFile = path.isAbsolute(outArg) ? outArg : path.join(process.cwd(), outArg);

fs.mkdirSync(path.dirname(outFile), { recursive: true });

const NS = {
  trc: 'urn:IEEE-1671:2010:TestResultsCollection',
  tr: 'urn:IEEE-1671:2010:TestResults',
  c: 'urn:IEEE-1671:2010:Common',
  ts: 'www.ni.com/TestStand/ATMLTestResults/2.0',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
};

const stream = fs.createWriteStream(outFile, { encoding: 'utf8' });

// Write with backpressure: resolve once the buffer drains so we never build the
// whole document in memory.
function write(chunk) {
  return new Promise((resolve) => {
    if (stream.write(chunk)) resolve();
    else stream.once('drain', resolve);
  });
}

const baseTime = new Date('2026-08-20T08:00:00.000Z').getTime();
const STEP_MS = 250; // synthetic elapsed time per step

function iso(ms) {
  return new Date(ms).toISOString();
}

// Deterministic pseudo-random so runs are reproducible.
let seed = 1234567;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

async function main() {
  const start = Date.now();
  const rsStart = baseTime;
  const rsEnd = baseTime + steps * STEP_MS;

  let failed = 0;

  await write(`<?xml version="1.0" encoding="UTF-8"?>\n`);
  await write(
    `<tr:TestResults xmlns:trc="${NS.trc}" xmlns:tr="${NS.tr}" ` +
    `xmlns:c="${NS.c}" xmlns:ts="${NS.ts}" xmlns:xsi="${NS.xsi}">\n`
  );
  await write(`  <tr:ResultSet name="MainSequence Callback" ` +
    `startDateTime="${iso(rsStart)}" endDateTime="${iso(rsEnd)}">\n`);
  await write(`    <tr:UUT><c:SerialNumber>SN-STRESS-100K</c:SerialNumber></tr:UUT>\n`);
  await write(`    <tr:TestStation><c:SerialNumber>STATION-STRESS-01</c:SerialNumber></tr:TestStation>\n`);
  await write(`    <tr:SystemOperator name="stress-test"/>\n`);

  for (let i = 1; i <= steps; i++) {
    const sStart = baseTime + (i - 1) * STEP_MS;
    const sEnd = sStart + STEP_MS;
    const low = 1.0;
    const high = 5.0;
    const value = (0.5 + rand() * 5.2).toFixed(4); // sometimes outside [1,5]
    const pass = Number(value) >= low && Number(value) <= high;
    if (!pass) failed++;
    const outcome = pass ? 'Passed' : 'Failed';

    await write(
      `    <tr:Test callerName="Step ${i}" name="Numeric Limit Test ${i}" ` +
      `startDateTime="${iso(sStart)}" endDateTime="${iso(sEnd)}">\n` +
      `      <tr:Outcome value="${outcome}"/>\n` +
      `      <ts:StepType>NI_NumericLimitTest</ts:StepType>\n` +
      `      <tr:TestResult name="Numeric">\n` +
      `        <c:TestData><c:Datum xsi:type="c:double" value="${value}" unit="V"/></c:TestData>\n` +
      `        <tr:TestLimits><tr:Limits>\n` +
      `          <c:LimitPair>\n` +
      `            <c:Limit comparator="GE"><c:Datum xsi:type="c:double" value="${low}"/></c:Limit>\n` +
      `            <c:Limit comparator="LE"><c:Datum xsi:type="c:double" value="${high}"/></c:Limit>\n` +
      `          </c:LimitPair>\n` +
      `        </tr:Limits></tr:TestLimits>\n` +
      `      </tr:TestResult>\n` +
      `    </tr:Test>\n`
    );

    if (i % 10000 === 0) process.stdout.write(`  ...${i.toLocaleString()} steps\r`);
  }

  const overall = failed > 0 ? 'Failed' : 'Passed';
  await write(`    <tr:Outcome value="${overall}"/>\n`);
  await write(`  </tr:ResultSet>\n`);
  await write(`</tr:TestResults>\n`);

  await new Promise((resolve) => stream.end(resolve));

  const { size } = fs.statSync(outFile);
  const secs = ((Date.now() - start) / 1000).toFixed(1);
  process.stdout.write('\n');
  console.log(`Wrote ${steps.toLocaleString()} steps (${failed.toLocaleString()} failed) -> ${outFile}`);
  console.log(`Size: ${(size / 1024 / 1024).toFixed(1)} MB, ${secs}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
