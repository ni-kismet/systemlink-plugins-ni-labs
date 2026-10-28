'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('demo server rejects malformed URLs and traversal without crashing', () => {
  let handler;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../scripts/start.js'), 'utf8'), {
    require: name => name === 'http' ? {
      createServer(callback) {
        handler = callback;
        return { listen(port, host) { assert.equal(host, '127.0.0.1'); } };
      }
    } : require(name),
    __dirname: path.join(__dirname, '../scripts'),
    process,
    console
  });

  for (const [url, expected] of [
    ['http://[', 400],
    ['/%ZZ', 400],
    ['/%2e%2e%2fpackage.json', 403],
    ['/', 302]
  ]) {
    let status;
    handler({ url, method: 'GET', headers: { host: '[' } }, {
      writeHead(value) { status = value; },
      end() {}
    });
    assert.equal(status, expected, url);
  }
});
