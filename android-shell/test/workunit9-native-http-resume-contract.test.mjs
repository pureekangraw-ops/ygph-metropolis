import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../native/updater/LighthouseUpdaterPlugin.java', import.meta.url), 'utf8');
const downloadStart = source.indexOf('private void download(String jobId, String urlString, File part)');
const downloadEnd = source.indexOf('private JSObject snapshot(', downloadStart);
assert.ok(downloadStart >= 0 && downloadEnd > downloadStart, 'download method must exist');
const download = source.slice(downloadStart, downloadEnd);

test('HTTP updater persists ETag or Last-Modified validator from responses', () => {
  assert.match(download, /getHeaderField\("ETag"\)/);
  assert.match(download, /getHeaderField\("Last-Modified"\)/);
  assert.match(download, /put\("etag"/);
  assert.match(download, /put\("lastModified"/);
});

test('partial resume sends Range and If-Range from durable validator', () => {
  assert.match(download, /getString\("etag"\)/);
  assert.match(download, /getString\("lastModified"\)/);
  assert.match(download, /setRequestProperty\("Range",\s*"bytes=" \+ existing \+ "-"\)/);
  assert.match(download, /setRequestProperty\("If-Range"/);
});

test('partial bytes append only after validated 206 Content-Range response', () => {
  assert.match(download, /getHeaderField\("Content-Range"\)/);
  assert.match(download, /contentRangeStartsAt\(contentRange, existing\)/);
  assert.match(download, /boolean\s+resumeAccepted\s*=/);
  assert.match(download, /new FileOutputStream\(part,\s*resumeAccepted\)/);
});

test('invalid resume response discards partial bytes and restarts from byte zero', () => {
  assert.match(download, /existing\s*>\s*0\s*&&\s*!resumeAccepted/);
  assert.match(download, /restartPartialFromZero\(jobId, urlString, part\)/);
  assert.match(source, /private boolean restartPartialFromZero\(String jobId, String urlString, File part\)/);
  assert.match(source, /part\.delete\(\)/);
  assert.match(source, /state\.put\("bytesDownloaded",\s*0L\)/);
  assert.match(source, /state\.remove\("totalBytes"\)/);
});
