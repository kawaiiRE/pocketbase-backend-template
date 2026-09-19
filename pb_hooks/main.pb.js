/// <reference path="../generated/types.d.ts" />

routerAdd(
  'GET',
  '/api/v1/health',
  (event) => {
    const healthService = require(__hooks + '/modules/health/health.service.cjs');
    const healthPresenter = require(__hooks + '/modules/health/health.presenter.cjs');
    const result = healthService.getHealth();

    return event.json(200, healthPresenter.presentHealth(result));
  },
  $apis.skipSuccessActivityLog(),
);
