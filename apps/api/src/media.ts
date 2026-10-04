import { createReadStream } from 'node:fs';
import { stat, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ObjectId } from 'mongodb';
import sharp from 'sharp';
import { MediaNameSchema } from '@elay/shared';
import type { Ctx } from './app.js';
import type { MediaDoc } from './db.js';
import { AppError, notFound } from './errors.js';
import { fieldError } from './util.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 4096 * 4096;

export const mediaUrl = (name: string | null) => (name ? `/api/media/${name}` : null);
const mediaPath = (ctx: Ctx, name: string) => path.join(path.resolve(ctx.config.MEDIA_DIR), name);

const TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

/** Read-only media serving. Names are server-generated and validated, so no path traversal is possible. */
export async function mediaRoutes(app: FastifyInstance) {
  app.get<{ Params: { name: string } }>('/api/media/:name', async (req, reply) => {
    const parsed = MediaNameSchema.safeParse(req.params.name);
    if (!parsed.success) throw notFound();
    const file = mediaPath(app.ctx, parsed.data);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) throw notFound();
    return reply
      .header('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream')
      .header('content-length', info.size)
      .header('x-content-type-options', 'nosniff')
      // Neutralises scripts if an SVG is opened directly.
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
      // Uploaded names are random and never reused; seeded demo-* names may change between seeds.
      .header('cache-control', parsed.data.startsWith('demo-') ? 'public, max-age=3600' : 'public, max-age=31536000, immutable')
      .send(createReadStream(file));
  });
}

// ---------- upload pipeline ----------

const invalid = (message: string) => fieldError('file', message);
const unsupported = () => new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'نوع فایل پشتیبانی نمی‌شود.');

/**
 * Rejects SVG features that can execute code or load anything external. The accepted SVG is then
 * rasterised to PNG, so no uploaded SVG is ever served.
 */
const SVG_DENY = [
  /<!DOCTYPE/i,
  /<!ENTITY/i,
  /<script/i,
  /<foreignObject/i,
  /<(iframe|embed|object|image|feImage|audio|video|animate|set)\b/i,
  /\son[a-z]+\s*=/i,
  /javascript:/i,
  /(?:xlink:)?href\s*=\s*["']\s*(?!#)/i,
  /url\(\s*['"]?\s*(?!#)/i,
  /@import/i,
  /&#/, // character references could hide any of the above from these patterns
];

export function assertSafeSvg(source: string) {
  if (!/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(source) || SVG_DENY.some((re) => re.test(source))) {
    throw invalid('این SVG پذیرفته نمی‌شود. لوگو را به صورت PNG یا SVG ساده بفرستید.');
  }
}

const isSquare = (w: number, h: number) => Math.abs(w - h) <= Math.max(2, Math.max(w, h) * 0.01);

type Kind = MediaDoc['kind'];

/**
 * Validates real bytes (not the declared type), enforces square dimensions, strips metadata by
 * re-encoding, stores under a random name and records ownership.
 *  - food: PNG/JPEG/WebP, square, ≥256px → WebP ≤1024px (transparency kept).
 *  - logos: PNG (square, ≥128px) or sanitised SVG → PNG ≤512px.
 */
export async function storeUpload(ctx: Ctx, body: unknown, contentType: string | undefined, kind: Kind, stallId: ObjectId | null) {
  if (!Buffer.isBuffer(body) || body.length === 0) throw unsupported();
  const declared = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  const allowed = kind === 'food' ? ['image/png', 'image/jpeg', 'image/webp'] : ['image/png', 'image/svg+xml'];
  if (!allowed.includes(declared)) throw unsupported();

  let output: Buffer;
  let ext: string;
  try {
    if (declared === 'image/svg+xml') {
      assertSafeSvg(body.toString('utf8'));
      const img = sharp(body, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
      const meta = await img.metadata();
      if (meta.format !== 'svg' || !meta.width || !meta.height || !isSquare(meta.width, meta.height)) throw invalid('لوگو باید مربعی باشد.');
      output = await img
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      ext = '.png';
    } else {
      const img = sharp(body, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
      const meta = await img.metadata();
      const expected = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' }[declared];
      if (meta.format !== expected) throw invalid('محتوای فایل با نوع آن یکی نیست.');
      const min = kind === 'food' ? 256 : 128;
      if (!meta.width || !meta.height || !isSquare(meta.width, meta.height)) throw invalid('عکس باید مربعی باشد.');
      if (Math.min(meta.width, meta.height) < min) throw invalid(`عکس باید حداقل ${min} پیکسل باشد.`);
      const oriented = img.rotate();
      if (kind === 'food') {
        output = await oriented.resize(1024, 1024, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
        ext = '.webp';
      } else {
        output = await oriented
          .resize(512, 512, { fit: 'contain', withoutEnlargement: true, background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        ext = '.png';
      }
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw invalid('فایل تصویر خراب یا نامعتبر است.');
  }

  const name = `${randomBytes(12).toString('hex')}${ext}`;
  await writeFile(mediaPath(ctx, name), output, { flag: 'wx' });
  try {
    await ctx.c.media.insertOne({ _id: name, kind, stallId, createdAt: ctx.now() });
  } catch (err) {
    await unlink(mediaPath(ctx, name)).catch(() => undefined); // no record → the sweep could never find it
    throw err;
  }
  return { name, url: mediaUrl(name)! };
}

/**
 * A media name may be attached when it is unchanged, or when it is an upload of the right kind
 * (and, for food images, owned by the same stall).
 */
export async function assertAttachable(ctx: Ctx, name: string | null, current: string | null, kind: Kind, stallId: ObjectId | null, field: string) {
  if (name === null || name === current) return;
  const doc = await ctx.c.media.findOne({ _id: name });
  const ok = doc && doc.kind === kind && (kind !== 'food' || (doc.stallId !== null && stallId !== null && doc.stallId.equals(stallId)));
  if (!ok) throw fieldError(field, 'فایل انتخاب‌شده معتبر نیست. دوباره آپلود کنید.');
}

/** Deletes a media file once nothing references it any more. Safe to call repeatedly. */
export async function releaseMedia(ctx: Ctx, name: string | null | undefined) {
  if (!name) return;
  const { c } = ctx;
  const used =
    (await c.foods.countDocuments({ image: name }, { limit: 1 })) ||
    (await c.stalls.countDocuments({ logo: name }, { limit: 1 })) ||
    (await c.foodcourt.countDocuments({ logo: name }, { limit: 1 }));
  if (used) return;
  await unlink(mediaPath(ctx, name)).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== 'ENOENT') throw e;
  });
  await c.media.deleteOne({ _id: name });
}

/** Removes uploads that were never attached (e.g. an abandoned form) after a grace period. */
export async function sweepOrphanMedia(ctx: Ctx, olderThanMs = 24 * 3600_000) {
  const stale = await ctx.c.media.find({ createdAt: { $lt: new Date(ctx.now().getTime() - olderThanMs) } }).toArray();
  for (const m of stale) await releaseMedia(ctx, m._id);
}
