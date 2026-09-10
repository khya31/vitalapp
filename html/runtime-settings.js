'use strict';

/**
 * GitHub Pages 前端連接 GAS JSON API。
 * 前端不得放置試算表 ID、Drive 資料夾 ID 或管理密碼。
 */
window.APP_RUNTIME_CONFIG = Object.freeze({
  gasWebAppUrl: 'https://script.google.com/macros/s/AKfycbyB94evsEwPD6X-oT31qIidOWOhpgI_eZUUw-XsyMgxqY8KARsFB5rAcwRt18JvH2Rq/exec',
  // 留空時管理後台沿用 gasWebAppUrl；有獨立管理部署時再填入其 /exec。
  adminGasWebAppUrl: '',
  releaseVersion: 'v0.14.4-prelaunch',
  expectedApiContractVersion: '1.2.0',
  assetVersion: '20260813-stableasset1'
});
