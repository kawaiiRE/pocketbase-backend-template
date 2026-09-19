import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { getHealth } = require('../pb_hooks/modules/health/health.service.cjs');
const { presentHealth } = require('../pb_hooks/modules/health/health.presenter.cjs');

describe('health endpoint modules', () => {
  it('returns an allowlisted stable health response', () => {
    const response = presentHealth(getHealth(new Date('2026-09-19T12:00:00.000Z')));

    expect(response).toEqual({
      status: 'ok',
      apiVersion: 1,
      service: 'pocketbase-next-backend-template',
      time: '2026-09-19T12:00:00.000Z',
    });
  });
});
