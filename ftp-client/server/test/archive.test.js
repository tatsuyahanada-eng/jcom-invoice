// Archive readers (browser modules, run under Node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLzh } from '../../public/js/archive/lzh.js';
import { readZip } from '../../public/js/archive/zip.js';
import { safeSegments } from '../../public/js/archive/util.js';

const fx = (n) => new Blob([fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', n))]);
const md5 = async (b) => crypto.createHash('md5').update(new Uint8Array(await b.arrayBuffer())).digest('hex');
const TEXT = 'b10c3e690ddd88ebf287b721d8eec626';
const BIN = 'bd8a2fde53da2aa0be229b8498b6116b';

for (const f of ['lh5.lzh', 'lh6.lzh', 'lh7.lzh', 'level0.lzh', 'level1.lzh']) {
  test(`LZH ${f}: content and Shift_JIS names`, async () => {
    const es = await readLzh(fx(f));
    const files = Object.fromEntries(es.filter((e) => !e.dir).map((e) => [e.path, e.data]));
    assert.equal(await md5(files['text.txt']), TEXT);
    assert.equal(await md5(files['sub/日本語.bin']), BIN);
  });
}

test('ZIP with Shift_JIS names (no UTF-8 flag)', async () => {
  const es = await readZip(fx('sjis.zip'));
  const files = Object.fromEntries(es.filter((e) => !e.dir).map((e) => [e.path, e.data]));
  assert.equal(await md5(files['日本語/text.txt']), TEXT);
  assert.equal(await md5(files['日本語/data.bin']), BIN);
});

test('zip-slip paths are rejected', async () => {
  const es = await readZip(fx('slip.zip'));
  assert.throws(() => safeSegments(es[0].path), /危険なパス/);
  assert.deepEqual(safeSegments('/abs/./a\\b.txt'), ['abs', 'a', 'b.txt']);
  assert.deepEqual(safeSegments('C:/x/y'), ['x', 'y']);
});
