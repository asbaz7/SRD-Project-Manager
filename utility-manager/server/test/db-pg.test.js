// Per-request database connections on Cloudflare (db-pg.js): reused between
// queries, capped, handed straight to the next waiting query, and closed
// when the request ends.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectionLimit } from '../src/db-pg.js';

function fakeConnect() {
  const made = [];
  const connect = async () => {
    const c = { id: made.length + 1, ended: false, end: async () => { c.ended = true; } };
    made.push(c);
    return c;
  };
  return { made, connect };
}

test('a connection is reused by the next query instead of opening another', async () => {
  const { made, connect } = fakeConnect();
  const scope = connectionLimit(4);
  const a = await scope.take(connect);
  scope.give(a);
  const b = await scope.take(connect);
  assert.equal(b, a);
  assert.equal(made.length, 1);
});

test('at most `max` are open; a waiting query gets the next one handed back', async () => {
  const { made, connect } = fakeConnect();
  const scope = connectionLimit(2);
  const a = await scope.take(connect);
  const b = await scope.take(connect);
  let third = null;
  const waiting = scope.take(connect).then((c) => { third = c; });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(third, null, 'waits while both are in use');
  scope.give(a);
  await waiting;
  assert.equal(third, a);
  assert.equal(made.length, 2);
  scope.give(b);
  scope.give(third);
});

test('a broken connection is closed, and a waiting query opens a new one', async () => {
  const { made, connect } = fakeConnect();
  const scope = connectionLimit(1);
  const a = await scope.take(connect);
  const waiting = scope.take(connect);
  scope.give(a, true);
  const b = await waiting;
  assert.equal(a.ended, true);
  assert.notEqual(b, a);
  assert.equal(made.length, 2);
});

test('closing the request ends idle connections at once and busy ones when handed back', async () => {
  const { connect } = fakeConnect();
  const scope = connectionLimit(4);
  const idle = await scope.take(connect);
  const busy = await scope.take(connect);
  scope.give(idle);
  scope.close();
  assert.equal(idle.ended, true);
  assert.equal(busy.ended, false, 'a query still running is not cut off');
  scope.give(busy);
  assert.equal(busy.ended, true);
});

test('a failed connect frees its slot for a waiting query', async () => {
  let fail = true;
  const scope = connectionLimit(1);
  const connect = async () => { if (fail) { fail = false; throw new Error('max clients reached'); } return { end: async () => {} }; };
  await assert.rejects(scope.take(connect));
  const c = await scope.take(connect);
  assert.ok(c);
});
