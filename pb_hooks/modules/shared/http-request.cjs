const { createAppError } = require('./http-error.cjs');

/**
 * Minimal structural view of core.RequestEvent used for body parsing.
 * @typedef JsonRequestEvent
 * @property {{ header: { get(name: string): string } }} request
 * @property {() => { body: unknown }} requestInfo
 */

/**
 * Reads a JSON object body. PocketBase parses the body; this enforces the content type and shape.
 *
 * @param {JsonRequestEvent} event
 * @returns {Record<string, unknown>}
 */
function readJsonObjectBody(event) {
  const contentType = String(event.request.header.get('Content-Type') || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    throw createAppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
  }

  /** @type {unknown} */
  let body;
  try {
    body = event.requestInfo().body;
  } catch {
    throw createAppError(400, 'INVALID_INPUT', 'Request body must be valid JSON.');
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw createAppError(400, 'INVALID_INPUT', 'Request body must be a JSON object.');
  }
  return /** @type {Record<string, unknown>} */ (body);
}

/**
 * Like readJsonObjectBody, but a request without a Content-Type header has an empty body.
 *
 * @param {JsonRequestEvent} event
 * @returns {Record<string, unknown>}
 */
function readOptionalJsonObjectBody(event) {
  if (!event.request.header.get('Content-Type')) return {};
  return readJsonObjectBody(event);
}

module.exports = { readJsonObjectBody, readOptionalJsonObjectBody };
