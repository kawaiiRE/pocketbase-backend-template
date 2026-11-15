/**
 * @typedef {Record<string, string>} FieldErrors
 *
 * @typedef ErrorBody
 * @property {string} message
 * @property {string} code
 * @property {FieldErrors} [fields]
 *
 * @typedef {Error & { isAppError: true, status: number, code: string, fields?: FieldErrors }} AppError
 */

const INTERNAL_ERROR_BODY = Object.freeze({
  message: 'Something went wrong. Try again later.',
  code: 'INTERNAL_ERROR',
});

/**
 * @param {number} status
 * @param {string} code
 * @param {string} message
 * @param {FieldErrors} [fields]
 * @returns {AppError}
 */
function createAppError(status, code, message, fields) {
  const error = /** @type {AppError} */ (new Error(message));
  error.isAppError = true;
  error.status = status;
  error.code = code;
  if (fields && Object.keys(fields).length > 0) {
    error.fields = fields;
  }
  return error;
}

/**
 * Duck-typed because PocketBase may evaluate modules in different VM instances.
 *
 * @param {unknown} value
 * @returns {value is AppError}
 */
function isAppError(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    /** @type {{ isAppError?: unknown }} */ (value).isAppError === true
  );
}

/**
 * @param {unknown} error
 * @returns {{ status: number, body: ErrorBody, expected: boolean }}
 */
function toErrorResponse(error) {
  if (!isAppError(error)) {
    return { status: 500, body: { ...INTERNAL_ERROR_BODY }, expected: false };
  }

  /** @type {ErrorBody} */
  const body = { message: error.message, code: error.code };
  if (error.fields) {
    body.fields = { ...error.fields };
  }
  return { status: error.status, body, expected: true };
}

/**
 * Writes a safe `{ message, code }` response. Unexpected errors are logged server-side only.
 *
 * @param {{ app: { logger(): { error(message: string, ...args: unknown[]): void } }, json(status: number, body: unknown): void }} event
 * @param {unknown} error
 */
function sendError(event, error) {
  const response = toErrorResponse(error);
  if (!response.expected) {
    event.app.logger().error('Unhandled custom route error.', 'error', String(error));
  }
  return event.json(response.status, response.body);
}

module.exports = { createAppError, isAppError, toErrorResponse, sendError };
