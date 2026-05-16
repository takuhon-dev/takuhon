import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * RFC 7807 problem type slugs used by meport. The 11 below are the
 * Spec-defined values (api.md §5.1); `methodNotAllowed` is added locally
 * for the 405 path that the Spec leaves unnamed.
 */
export const ERROR_SLUGS = {
  badRequest: 'bad-request',
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  notFound: 'not-found',
  methodNotAllowed: 'method-not-allowed',
  conflict: 'conflict',
  payloadTooLarge: 'payload-too-large',
  unsupportedMediaType: 'unsupported-media-type',
  validationFailed: 'validation-failed',
  tooManyRequests: 'too-many-requests',
  internal: 'internal',
  serviceUnavailable: 'service-unavailable',
} as const;

export type ErrorSlug = (typeof ERROR_SLUGS)[keyof typeof ERROR_SLUGS];

const TYPE_BASE = 'https://meport.dev/errors';

export interface ProblemFieldError {
  path: string;
  message: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  errors?: ProblemFieldError[];
  currentVersion?: string;
}

export interface BuildProblemInput {
  slug: ErrorSlug;
  status: number;
  title: string;
  detail: string;
  instance: string;
  errors?: ProblemFieldError[];
  currentVersion?: string;
}

export function buildProblem(input: BuildProblemInput): ProblemDetails {
  const out: ProblemDetails = {
    type: `${TYPE_BASE}/${input.slug}`,
    title: input.title,
    status: input.status,
    detail: input.detail,
    instance: input.instance,
  };
  if (input.errors !== undefined) out.errors = input.errors;
  if (input.currentVersion !== undefined) out.currentVersion = input.currentVersion;
  return out;
}

export interface ProblemResponseInput {
  slug: ErrorSlug;
  status: ContentfulStatusCode;
  title: string;
  detail: string;
  errors?: ProblemFieldError[];
  currentVersion?: string;
}

export function problemResponse(c: Context, input: ProblemResponseInput): Response {
  const body = buildProblem({
    slug: input.slug,
    status: input.status,
    title: input.title,
    detail: input.detail,
    instance: new URL(c.req.url).pathname,
    errors: input.errors,
    currentVersion: input.currentVersion,
  });
  return c.body(JSON.stringify(body), input.status, {
    'content-type': 'application/problem+json; charset=utf-8',
  });
}
