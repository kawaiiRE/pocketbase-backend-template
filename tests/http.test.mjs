import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  createAppError,
  sendError,
  toErrorResponse,
} = require('../pb_hooks/modules/shared/http-error.cjs');
const { readJsonObjectBody } = require('../pb_hooks/modules/shared/http-request.cjs');
const { presentPublicConfig } = require('../pb_hooks/modules/config/config.presenter.cjs');

/**
 * @param {string} contentType
 * @param {() => { body: unknown }} requestInfo
 */
function requestEvent(contentType, requestInfo) {
  return { request: { header: { get: () => contentType } }, requestInfo };
}

/** @param {() => unknown} action */
function errorResponseOf(action) {
  try {
    action();
  } catch (error) {
    return toErrorResponse(error);
  }
  throw new Error('Expected the action to throw.');
}

describe('error responses', () => {
  it('omits empty field maps', () => {
    expect(toErrorResponse(createAppError(403, 'FORBIDDEN', 'No.', {})).body).toEqual({
      message: 'No.',
      code: 'FORBIDDEN',
    });
  });

  it('logs unexpected errors server-side and returns a generic body', () => {
    const error = vi.fn();
    const json = vi.fn();
    sendError({ app: { logger: () => ({ error }) }, json }, new Error('SQLITE_BUSY at /pb_data'));
    expect(error).toHaveBeenCalledOnce();
    expect(json).toHaveBeenCalledWith(500, {
      message: 'Something went wrong. Try again later.',
      code: 'INTERNAL_ERROR',
    });
  });

  it('does not log expected application errors', () => {
    const error = vi.fn();
    const json = vi.fn();
    sendError({ app: { logger: () => ({ error }) }, json }, createAppError(409, 'X', 'Taken'));
    expect(error).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(409, { message: 'Taken', code: 'X' });
  });
});

describe('readJsonObjectBody', () => {
  it('returns parsed JSON objects', () => {
    const body = { name: 'Ada' };
    expect(
      readJsonObjectBody(requestEvent('application/json; charset=utf-8', () => ({ body }))),
    ).toBe(body);
  });

  it('requires a JSON content type', () => {
    expect(
      errorResponseOf(() => readJsonObjectBody(requestEvent('text/plain', () => ({ body: {} })))),
    ).toMatchObject({ status: 415, body: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
  });

  it('maps malformed JSON and non-object bodies to INVALID_INPUT', () => {
    const malformed = requestEvent('application/json', () => {
      throw new Error('unexpected end of JSON input');
    });
    expect(errorResponseOf(() => readJsonObjectBody(malformed))).toMatchObject({
      status: 400,
      body: { code: 'INVALID_INPUT', message: 'Request body must be valid JSON.' },
    });
    expect(
      errorResponseOf(() =>
        readJsonObjectBody(requestEvent('application/json', () => ({ body: [] }))),
      ),
    ).toMatchObject({ status: 400, body: { code: 'INVALID_INPUT' } });
  });
});

describe('presentPublicConfig', () => {
  it('returns the versioned feature contract', () => {
    expect(
      presentPublicConfig(
        { registrationEnabled: true, requireEmailVerification: false, guestEnabled: true },
        { ttlHours: 24 },
      ),
    ).toEqual({
      apiVersion: 1,
      features: { registration: true, emailVerification: false, guest: true, guestTtlHours: 24 },
    });
  });
});
