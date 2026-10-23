import test from 'node:test';
import assert from 'node:assert/strict';
import { editorWebsiteURL, readEditorWebsiteText, readEditorDirectory } from '../js/editor-directory.js';

test('website directory URLs stay on the editor origin and resolve against the master file', () => {
  const base = 'https://maze.example/config/main-config.txt';
  assert.equal(editorWebsiteURL('../maps/map-4.txt', base, 'https://maze.example'), 'https://maze.example/maps/map-4.txt');
  for (const url of ['https://other.example/map.txt', 'http://maze.example/map.txt', '//other.example/map.txt', 'javascript:alert(1)', 'file:///map.txt', 'https://name:password@maze.example/map.txt']) {
    assert.throws(() => editorWebsiteURL(url, base, 'https://maze.example'), /same HTTP/);
  }
});
test('directory reads every registered map, preserving IDs and sorting numerically', async t => {
  const text = '[Game]\nStartMap: 3\n[Maps]\nMap.10: ../maps/ten.txt\nMap.4: ../maps/four.txt?rev=2\nMap.3: ../maps/three.txt\n';
  let requested;
  t.mock.method(globalThis, 'fetch', async (url, options) => { requested = [url, options]; return new Response(text); });
  const directory = await readEditorDirectory('./config/main-config.txt', 'https://maze.example/editor.html');
  assert.deepEqual([...directory.files.keys()], [3, 4, 10]);
  assert.equal(directory.files.get(4), 'https://maze.example/maps/four.txt?rev=2');
  assert.equal(requested[0], 'https://maze.example/config/main-config.txt');
  assert.equal(requested[1].credentials, 'omit'); assert.equal(requested[1].cache, 'no-store');
  assert.equal(requested[1].redirect, 'error');
});
test('website reads reject HTTP errors, oversized headers and oversized UTF-8 streams', async t => {
  const request = t.mock.method(globalThis, 'fetch', async () => new Response('Missing', { status: 404 }));
  await assert.rejects(readEditorWebsiteText('https://maze.example/map.txt'), /HTTP 404/);
  request.mock.mockImplementation(async () => new Response('', { headers: { 'content-length': '2000001' } }));
  await assert.rejects(readEditorWebsiteText('https://maze.example/map.txt'), /2 MB/);
  request.mock.mockImplementation(async () => new Response('🌳'.repeat(500_001)));
  await assert.rejects(readEditorWebsiteText('https://maze.example/map.txt'), /2 MB/);
});
