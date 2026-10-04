import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { MediaNameSchema } from '@elay/shared';
import { notFound } from './errors.js';

export const mediaUrl = (name: string | null) => (name ? `/api/media/${name}` : null);

const TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

/** Read-only media serving. Names are server-generated and validated, so no path traversal is possible. */
export async function mediaRoutes(app: FastifyInstance) {
  const dir = path.resolve(app.ctx.config.MEDIA_DIR);
  app.get<{ Params: { name: string } }>('/api/media/:name', async (req, reply) => {
    const parsed = MediaNameSchema.safeParse(req.params.name);
    if (!parsed.success) throw notFound();
    const file = path.join(dir, parsed.data);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) throw notFound();
    return reply
      .header('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream')
      .header('content-length', info.size)
      .header('x-content-type-options', 'nosniff')
      // Neutralises scripts if an SVG is opened directly.
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
      .header('cache-control', 'public, max-age=86400')
      .send(createReadStream(file));
  });
}
