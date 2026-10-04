import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collections } from '../src/db.js';
import { sweepOrphanMedia } from '../src/media.js';
import { authed, createAccount, createStall, login, setup, type Session, type TestEnv } from './helpers.js';

const clock = { now: new Date('2026-10-04T10:00:00Z') };
let t: TestEnv;
let root: Session;
let owner: Session;
let foodUrl: string;

const raster = (w: number, h: number, fmt: 'png' | 'jpeg' | 'webp' = 'png') =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 10, g: 120, b: 90, alpha: 0 } } })[fmt]().toBuffer();
const post = (s: Session, url: string, body: Buffer | string, type: string) =>
  t.app.inject({ method: 'POST', url, headers: { ...authed(s), 'content-type': type }, payload: body });
const svg = (inner: string, size = 'width="64" height="64" viewBox="0 0 64 64"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${size}>${inner}</svg>`;

beforeAll(async () => {
  t = await setup({}, clock);
  await createAccount(t.db, 'root', 'rootpass1', 'super_admin');
  const stall = await createStall(t.db, 'S');
  await createAccount(t.db, 'own', 'ownpass12', 'stall_admin', stall);
  root = await login(t.app, 'root', 'rootpass1');
  owner = await login(t.app, 'own', 'ownpass12');
  foodUrl = `/api/admin/stalls/${stall}/media/food-image`;
});
afterAll(() => t?.close());

describe('food images', () => {
  it('accepts square PNG/JPEG/WebP, re-encodes to WebP ≤1024 keeping transparency', async () => {
    for (const fmt of ['png', 'jpeg', 'webp'] as const) {
      const res = await post(owner, foodUrl, await raster(1500, 1500, fmt), `image/${fmt}`);
      expect(res.statusCode, res.body).toBe(201);
      const { name, url } = res.json();
      expect(name).toMatch(/^[a-f0-9]{24}\.webp$/);
      const meta = await sharp(path.join(t.config.MEDIA_DIR, name)).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['webp', 1024, 1024]);
      if (fmt !== 'jpeg') expect(meta.hasAlpha).toBe(true);
      const served = await t.app.inject(url);
      expect([served.statusCode, served.headers['content-type']]).toEqual([200, 'image/webp']);
    }
  });

  it('rejects non-square, tiny, mislabelled, corrupt, wrong-type and oversized uploads', async () => {
    const cases: [Buffer | string, string, number][] = [
      [await raster(600, 400), 'image/png', 400],
      [await raster(100, 100), 'image/png', 400],
      [await raster(400, 400, 'jpeg'), 'image/png', 400],
      [Buffer.from('not an image at all'), 'image/png', 400],
      [svg('<rect width="64" height="64"/>'), 'image/svg+xml', 415], // logos only
      [await raster(400, 400), 'image/gif', 415],
      [Buffer.alloc(5 * 1024 * 1024 + 10), 'image/png', 413],
    ];
    for (const [body, type, status] of cases) {
      const res = await post(owner, foodUrl, body, type);
      expect(res.statusCode, `${type} ${res.body}`).toBe(status);
    }
  });

  it('requires an authenticated owner', async () => {
    const anon = await t.app.inject({ method: 'POST', url: foodUrl, headers: { 'content-type': 'image/png' }, payload: await raster(300, 300) });
    expect(anon.statusCode).toBe(401);
    expect((await post(owner, '/api/admin/media/stall-logo', await raster(300, 300), 'image/png')).statusCode).toBe(403);
  });
});

describe('logos', () => {
  it('rasterises a clean square SVG to PNG and accepts square PNG', async () => {
    const res = await post(root, '/api/admin/media/stall-logo', svg('<circle cx="32" cy="32" r="30" fill="#143759"/>'), 'image/svg+xml');
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().name).toMatch(/\.png$/);
    const meta = await sharp(path.join(t.config.MEDIA_DIR, res.json().name)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 512, 512]);
    expect((await post(root, '/api/admin/media/foodcourt-logo', await raster(256, 256), 'image/png')).statusCode).toBe(201);
    expect((await post(root, '/api/admin/media/stall-logo', await raster(256, 256, 'webp'), 'image/webp')).statusCode).toBe(415);
  });

  it('rejects SVG with scripts, handlers, external references, entities or foreign content', async () => {
    const evil = [
      svg('<script>alert(1)</script>'),
      svg('<rect width="64" height="64" onload="alert(1)"/>'),
      svg('<image href="https://evil.example/x.png" width="64" height="64"/>'),
      svg('<use xlink:href="file:///etc/passwd#x"/>'),
      svg('<rect style="fill:url(https://evil.example/p)" width="64" height="64"/>'),
      svg('<foreignObject><iframe src="https://evil.example"></iframe></foreignObject>'),
      `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>${svg('<text>&x;</text>')}`,
      svg('<a href="javascript:alert(1)"><rect width="64" height="64"/></a>'),
      svg('<rect style="fill:u&#114;l(https://evil.example/p)" width="64" height="64"/>'), // encoded "url("
      svg('<rect width="64" height="64"/>', 'width="64" height="32"'), // not square
      '<html><svg></svg></html>',
    ];
    for (const body of evil) {
      const res = await post(root, '/api/admin/media/stall-logo', body, 'image/svg+xml');
      expect(res.statusCode, body).toBe(400);
    }
  });
});

describe('reference-aware cleanup', () => {
  it('sweeps unattached uploads after the grace period and keeps referenced ones', async () => {
    const keep = (await post(root, '/api/admin/media/foodcourt-logo', await raster(256, 256), 'image/png')).json().name;
    const drop = (await post(root, '/api/admin/media/foodcourt-logo', await raster(256, 256), 'image/png')).json().name;
    const set = await t.app.inject({
      method: 'PUT', url: '/api/admin/foodcourt', headers: authed(root),
      payload: { name: 'ال‌آی', logo: keep, menuOpen: true, closedMessage: '' },
    });
    expect(set.statusCode, set.body).toBe(200);
    clock.now = new Date(clock.now.getTime() + 25 * 3600_000);
    await sweepOrphanMedia(t.app.ctx);
    expect(existsSync(path.join(t.config.MEDIA_DIR, keep))).toBe(true);
    expect(existsSync(path.join(t.config.MEDIA_DIR, drop))).toBe(false);
    expect(await collections(t.db).media.countDocuments({ _id: drop })).toBe(0);

    // Replacing the logo releases the old file immediately.
    const next = (await post(root, '/api/admin/media/foodcourt-logo', await raster(256, 256), 'image/png')).json().name;
    await t.app.inject({ method: 'PUT', url: '/api/admin/foodcourt', headers: authed(root), payload: { name: 'ال‌آی', logo: next, menuOpen: true, closedMessage: '' } });
    expect(existsSync(path.join(t.config.MEDIA_DIR, keep))).toBe(false);
  });
});
