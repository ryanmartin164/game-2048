// Runs the game logic from index.html in a bare VM (no DOM) and checks the
// sliding, merging, spawning and end-of-game rules.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, 'index.html has a script block');

const mod = { exports: {} };
vm.runInNewContext(match[1], { module: mod, console });
const G = mod.exports;

const grid = values => G.gridFromValues(values);
const vals = result => G.gridValues(result.grid);
const same = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected));

const EMPTY = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
const row = r => [r, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
const col = c => [[c[0], 0, 0, 0], [c[1], 0, 0, 0], [c[2], 0, 0, 0], [c[3], 0, 0, 0]];

test('exports the logic functions', () => {
  for (const name of ['applyMove', 'hasMoves', 'spawnTile', 'gridFromValues', 'gridValues', 'maxValue']) {
    assert.equal(typeof G[name], 'function', name);
  }
  assert.equal(G.SIZE, 4);
});

test('gridValues round-trips gridFromValues', () => {
  const v = [[2, 0, 4, 0], [0, 8, 0, 16], [32, 0, 64, 0], [0, 128, 0, 256]];
  same(G.gridValues(grid(v)), v);
});

test('slides left and merges a pair', () => {
  const r = G.applyMove(grid(row([2, 2, 0, 0])), 'left');
  same(vals(r)[0], [4, 0, 0, 0]);
  assert.equal(r.gained, 4);
  assert.equal(r.moved, true);
  assert.equal(r.merges.length, 1);
  assert.equal(r.merges[0].tile.value, 4);
  same(r.merges[0].to, { r: 0, c: 0 });
});

test('four equal tiles become two merges, not one chain', () => {
  const r = G.applyMove(grid(row([2, 2, 2, 2])), 'left');
  same(vals(r)[0], [4, 4, 0, 0]);
  assert.equal(r.gained, 8);
  assert.equal(r.merges.length, 2);
});

test('a freshly merged tile does not merge again in the same move', () => {
  const r = G.applyMove(grid(row([4, 2, 2, 0])), 'left');
  same(vals(r)[0], [4, 4, 0, 0]);
  assert.equal(r.gained, 4);
});

test('merges the pair nearest the wall first', () => {
  const r = G.applyMove(grid(row([2, 2, 2, 0])), 'left');
  same(vals(r)[0], [4, 2, 0, 0]);
  const r2 = G.applyMove(grid(row([0, 2, 2, 2])), 'right');
  same(vals(r2)[0], [0, 0, 2, 4]);
});

test('slides right across gaps', () => {
  const r = G.applyMove(grid(row([2, 0, 0, 2])), 'right');
  same(vals(r)[0], [0, 0, 0, 4]);
  assert.equal(r.gained, 4);
});

test('slides up and down along columns', () => {
  const up = G.applyMove(grid(col([2, 0, 2, 0])), 'up');
  same(vals(up).map(r => r[0]), [4, 0, 0, 0]);
  const down = G.applyMove(grid(col([2, 0, 2, 4])), 'down');
  same(vals(down).map(r => r[0]), [0, 0, 4, 4]);
  assert.equal(down.gained, 4);
});

test('reports no movement when nothing can slide', () => {
  const r = G.applyMove(grid(row([2, 4, 8, 16])), 'left');
  assert.equal(r.moved, false);
  assert.equal(r.gained, 0);
  assert.equal(r.moves.length, 0);
  same(vals(r)[0], [2, 4, 8, 16]);
});

test('keeps tile ids on plain slides so the UI can animate them', () => {
  const g = grid(row([0, 0, 0, 2]));
  const id = g[0][3].id;
  const r = G.applyMove(g, 'left');
  assert.equal(r.grid[0][0].id, id);
  assert.equal(r.moves.length, 1);
  assert.equal(r.moves[0].id, id);
  same(r.moves[0].to, { r: 0, c: 0 });
});

test('does not mutate the input grid', () => {
  const g = grid(row([2, 2, 0, 0]));
  G.applyMove(g, 'left');
  same(G.gridValues(g), row([2, 2, 0, 0]));
});

test('spawnTile fills exactly one empty cell', () => {
  const g = grid(EMPTY);
  const spawn = G.spawnTile(g, () => 0.5);
  assert.ok(spawn);
  assert.equal(spawn.tile.value, 2);
  assert.equal(G.gridValues(g).flat().filter(v => v).length, 1);
  const g4 = grid(EMPTY);
  assert.equal(G.spawnTile(g4, () => 0.95).tile.value, 4);
});

test('spawnTile returns null on a full board', () => {
  const full = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]];
  assert.equal(G.spawnTile(grid(full)), null);
});

test('hasMoves is false only when the board is full with no equal neighbours', () => {
  const stuck = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]];
  assert.equal(G.hasMoves(grid(stuck)), false);
  const pair = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 4]];
  assert.equal(G.hasMoves(grid(pair)), true);
  const vertical = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [2, 8, 4, 2]];
  assert.equal(G.hasMoves(grid(vertical)), true);
  const gap = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 0, 4], [4, 2, 4, 2]];
  assert.equal(G.hasMoves(grid(gap)), true);
});

test('maxValue finds the largest tile', () => {
  assert.equal(G.maxValue(grid(EMPTY)), 0);
  assert.equal(G.maxValue(grid([[2, 1024, 0, 0], [0, 0, 2048, 0], [0, 0, 0, 0], [0, 0, 0, 0]])), 2048);
});
