import type { ApiError, ErrorCode } from '@elay/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import type { z } from 'zod';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'ابتدا وارد شوید.');
export const forbidden = () => new AppError(403, 'FORBIDDEN', 'به این بخش دسترسی ندارید.');
export const notFound = () => new AppError(404, 'NOT_FOUND', 'پیدا نشد.');

/** Parse untrusted input; throws a 400 VALIDATION_ERROR with field paths. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  throw new AppError(
    400,
    'VALIDATION_ERROR',
    'اطلاعات واردشده درست نیست.',
    r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  );
}

const body = (code: ErrorCode, message: string, details?: ApiError['error']['details']): ApiError => ({
  error: details ? { code, message, details } : { code, message },
});

export function installErrorHandling(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | AppError, req, reply) => {
    if (err instanceof AppError) return reply.status(err.status).send(body(err.code, err.message, err.details));
    const status = err.statusCode ?? 500;
    if (status === 429) return reply.status(429).send(body('RATE_LIMITED', 'درخواست‌ها زیاد است. کمی بعد دوباره امتحان کنید.'));
    if (status === 413) return reply.status(413).send(body('PAYLOAD_TOO_LARGE', 'حجم درخواست زیاد است.'));
    if (status === 415) return reply.status(415).send(body('UNSUPPORTED_MEDIA_TYPE', 'نوع محتوا پشتیبانی نمی‌شود.'));
    if (status === 404) return reply.status(404).send(body('NOT_FOUND', 'پیدا نشد.'));
    if (status >= 400 && status < 500) return reply.status(status).send(body('VALIDATION_ERROR', 'درخواست نامعتبر است.'));
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send(body('INTERNAL_ERROR', 'خطای غیرمنتظره. دوباره امتحان کنید.'));
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send(body('NOT_FOUND', 'پیدا نشد.')));
}
