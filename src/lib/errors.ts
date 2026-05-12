/**
 * Typed application errors.
 *
 * The base `AppError` carries an HTTP-ish `status` and a stable `code` so
 * tRPC error formatters / API route handlers can map them consistently.
 */

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, opts: { status?: number; code?: string; cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = new.target.name;
    this.status = opts.status ?? 500;
    this.code = opts.code ?? 'INTERNAL';
    Error.captureStackTrace?.(this, new.target);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', cause?: unknown) {
    super(message, { status: 404, code: 'NOT_FOUND', cause });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', cause?: unknown) {
    super(message, { status: 403, code: 'FORBIDDEN', cause });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', cause?: unknown) {
    super(message, { status: 401, code: 'UNAUTHORIZED', cause });
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid input', cause?: unknown) {
    super(message, { status: 400, code: 'VALIDATION', cause });
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
