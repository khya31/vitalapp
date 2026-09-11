'use strict';

(function(global) {
  const DEFAULT_REQUEST_TIMEOUT_MS = 90 * 1000;
  const LONG_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
  const LONG_RUNNING_ACTIONS = new Set([
    'adminRunDailyHotDataReconciliation',
    'adminRunWeeklyArchive',
    'adminRunArchiveCleanup',
    'adminPreviewFix12DataRepairs',
    'adminRunFix12DataRepairBatch',
    'adminEnsureDataMaintenanceTriggers',
    'adminRunV0131Migration',
    'adminResumeV0131Migration',
    'adminPauseV0131Migration',
    'adminStartV0131Finalization',
    'adminVerifyV0131Migration',
    'adminResetV0132Migration',
    'adminVerifyArchiveBatch',
    'adminGetArchiveManifest',
    'adminResumeArchiveBatch',
    'adminPreviewSpecialTaskCsv',
    'adminConfirmSpecialTaskResults',
    'adminSendSpecialTaskRewards'
  ]);
  const BRIDGE_READY_TIMEOUT_MS = 12 * 1000;
  const BRIDGE_RELOAD_MS = 20 * 1000;
  const BRIDGE_MESSAGE_READY = 'vitalapp-gas-ready';
  const BRIDGE_MESSAGE_REQUEST = 'vitalapp-gas-request';
  const BRIDGE_MESSAGE_RESPONSE = 'vitalapp-gas-response';
  const BRIDGE_CHANNEL = [
    'vitalapp',
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
    Math.random().toString(36).slice(2)
  ].join('-');
  let bridgeFrame = null;
  let bridgeOrigin = '';
  let bridgeReady = false;
  let bridgeReadyPromise = null;
  let bridgeReadyResolve = null;
  let bridgeReloadTimer = 0;
  let bridgeRequestSequence = 0;
  const bridgePendingRequests = new Map();

  function isAdminAction_(action) {
    return String(action || '').indexOf('admin') === 0;
  }

  function getApiUrl_(action) {
    const config = global.APP_RUNTIME_CONFIG || {};
    const publicUrl = String(config.gasWebAppUrl || '').trim();
    const adminUrl = String(config.adminGasWebAppUrl || '').trim();
    return isAdminAction_(action) ? (adminUrl || publicUrl) : publicUrl;
  }

  function getBridgeUrl_() {
    const url = new URL(getApiUrl_('ping'));
    const config = global.APP_RUNTIME_CONFIG || {};
    url.searchParams.set('bridge', '1');
    url.searchParams.set('channel', BRIDGE_CHANNEL);
    url.searchParams.set('v', String(config.releaseVersion || Date.now()));
    return url.toString();
  }

  function isTrustedBridgeOrigin_(origin) {
    try {
      const parsed = new URL(String(origin || ''));
      return parsed.protocol === 'https:' && (
        parsed.hostname === 'script.google.com' ||
        parsed.hostname === 'script.googleusercontent.com' ||
        parsed.hostname.endsWith('.script.googleusercontent.com') ||
        parsed.hostname.endsWith('-script.googleusercontent.com')
      );
    } catch (error) {
      return false;
    }
  }

  function reloadBridgeUntilReady_() {
    if (bridgeReady || !bridgeFrame) return;
    bridgeFrame.src = getBridgeUrl_() + '&attempt=' + Date.now();
    bridgeReloadTimer = global.setTimeout(
      reloadBridgeUntilReady_,
      BRIDGE_RELOAD_MS
    );
  }

  function ensureBridge_() {
    if (bridgeReadyPromise) return bridgeReadyPromise;

    bridgeReadyPromise = new Promise((resolve) => {
      bridgeReadyResolve = resolve;

      const mount = () => {
        if (bridgeFrame || !global.document.body) return;
        bridgeFrame = global.document.createElement('iframe');
        bridgeFrame.setAttribute('aria-hidden', 'true');
        bridgeFrame.setAttribute('tabindex', '-1');
        bridgeFrame.style.cssText =
          'position:absolute;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
        bridgeFrame.src = getBridgeUrl_();
        global.document.body.appendChild(bridgeFrame);
        bridgeReloadTimer = global.setTimeout(
          reloadBridgeUntilReady_,
          BRIDGE_RELOAD_MS
        );
      };

      if (global.document.body) {
        mount();
      } else {
        global.document.addEventListener('DOMContentLoaded', mount, { once: true });
      }
    });

    return bridgeReadyPromise;
  }

  function waitForBridgeReady_() {
    if (bridgeReady) return Promise.resolve(true);

    return Promise.race([
      ensureBridge_().then(() => true),
      new Promise((resolve) => {
        global.setTimeout(() => resolve(false), BRIDGE_READY_TIMEOUT_MS);
      })
    ]);
  }

  function createBridgeRpcError_(message) {
    const error = new Error(message || 'GAS RPC 失敗');
    error.code = 'BRIDGE_RPC_ERROR';
    return error;
  }

  function invokeViaBridge_(functionName, args) {
    const requestId = [
      Date.now().toString(36),
      (++bridgeRequestSequence).toString(36),
      Math.random().toString(36).slice(2)
    ].join('-');
    const timeoutMs = getRequestTimeoutMs_(functionName);

    return new Promise((resolve, reject) => {
      const timeoutId = global.setTimeout(() => {
        bridgePendingRequests.delete(requestId);
        reject(createTimeoutError_());
      }, timeoutMs);

      bridgePendingRequests.set(requestId, {
        resolve: resolve,
        reject: reject,
        timeoutId: timeoutId
      });

      bridgeFrame.contentWindow.postMessage({
        type: BRIDGE_MESSAGE_REQUEST,
        id: requestId,
        channel: BRIDGE_CHANNEL,
        action: functionName,
        args: Array.isArray(args) ? args : []
      }, bridgeOrigin);
    });
  }

  global.addEventListener('message', (event) => {
    if (
      !bridgeFrame ||
      event.source !== bridgeFrame.contentWindow ||
      !isTrustedBridgeOrigin_(event.origin)
    ) {
      return;
    }

    const message = event.data || {};
    if (message.channel !== BRIDGE_CHANNEL) return;
    if (message.type === BRIDGE_MESSAGE_READY) {
      bridgeOrigin = event.origin;
      bridgeReady = true;
      if (bridgeReloadTimer) global.clearTimeout(bridgeReloadTimer);
      if (bridgeReadyResolve) bridgeReadyResolve(true);
      return;
    }

    if (message.type !== BRIDGE_MESSAGE_RESPONSE || !message.id) return;
    const pending = bridgePendingRequests.get(String(message.id));
    if (!pending) return;

    bridgePendingRequests.delete(String(message.id));
    global.clearTimeout(pending.timeoutId);

    if (message.error) {
      pending.reject(createBridgeRpcError_(String(message.error)));
      return;
    }

    try {
      validateApiCompatibilityFromResponse_(message.result);
      pending.resolve(message.result);
    } catch (error) {
      pending.reject(error);
    }
  });

  function validateApiUrl_(url) {
    if (!url) {
      throw new Error('尚未設定對應的 GAS Web App /exec 網址');
    }

    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) {
      throw new Error('GAS Web App 網址格式錯誤，必須使用完整的 /exec 網址');
    }
  }

  function getRequestTimeoutMs_(action) {
    return LONG_RUNNING_ACTIONS.has(action)
      ? LONG_REQUEST_TIMEOUT_MS
      : DEFAULT_REQUEST_TIMEOUT_MS;
  }

  function getExpectedApiContractVersion_() {
    const config = global.APP_RUNTIME_CONFIG || {};
    return String(config.expectedApiContractVersion || '').trim();
  }

  function getSemverMajor_(value) {
    const match = String(value || '').trim().match(/^(?:v)?(\d+)(?:\.|$)/);
    return match ? Number(match[1]) : -1;
  }

  function parseSemverParts_(value) {
    const match = String(value || '').trim().match(
      /^(?:v)?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/
    );
    if (!match) return null;
    return [
      Number(match[1]),
      /^(?:x|\*)$/i.test(match[2] || '0') ? null : Number(match[2] || 0),
      /^(?:x|\*)$/i.test(match[3] || '0') ? null : Number(match[3] || 0)
    ];
  }

  function compareSemverParts_(left, right) {
    for (let index = 0; index < 3; index += 1) {
      const difference = Number(left[index] || 0) - Number(right[index] || 0);
      if (difference) return difference;
    }
    return 0;
  }

  function isVersionWithinBound_(version, bound, isMaximum) {
    if (!bound) return true;
    const parsedVersion = parseSemverParts_(version);
    const parsedBound = parseSemverParts_(bound);
    if (!parsedVersion || !parsedBound) return false;
    if (parsedVersion[0] !== parsedBound[0]) {
      return isMaximum
        ? parsedVersion[0] < parsedBound[0]
        : parsedVersion[0] > parsedBound[0];
    }
    if (parsedBound[1] == null) return true;
    if (parsedVersion[1] !== parsedBound[1]) {
      return isMaximum
        ? parsedVersion[1] < parsedBound[1]
        : parsedVersion[1] > parsedBound[1];
    }
    if (parsedBound[2] == null) return true;
    const comparison = compareSemverParts_(parsedVersion, parsedBound);
    return isMaximum ? comparison <= 0 : comparison >= 0;
  }

  function isApiContractCompatible_(actualVersion, expectedVersion, supportedRange) {
    const actualMajor = getSemverMajor_(actualVersion);
    const expectedMajor = getSemverMajor_(expectedVersion);

    if (actualMajor < 0 || expectedMajor < 0 || actualMajor !== expectedMajor) {
      return false;
    }

    const minVersion = String(supportedRange && supportedRange.MIN || '').trim();
    const maxVersion = String(supportedRange && supportedRange.MAX || '').trim();
    if (!isVersionWithinBound_(expectedVersion, minVersion, false)) {
      return false;
    }
    if (!isVersionWithinBound_(expectedVersion, maxVersion, true)) {
      return false;
    }

    return true;
  }

  function createCompatibilityError_(actualVersion, expectedVersion) {
    const error = new Error(
      'API 契約不相容：目前後端契約是 ' +
      (actualVersion || '未知版本') +
      '，前端需要相容於 ' +
      expectedVersion +
      '。請先部署配對的 GAS 後端，再重新載入頁面。'
    );
    error.code = 'API_CONTRACT_MISMATCH';
    return error;
  }

  function validateApiCompatibilityFromResponse_(responseBody) {
    const expectedVersion = getExpectedApiContractVersion_();

    if (!expectedVersion || !responseBody || typeof responseBody !== 'object') {
      return;
    }

    /*
     * 契約資訊由實際 API 回應的 meta 提供，不再額外先送一次 GET 健康檢查。
     * 舊後端沒有 meta 時暫時允許回應，避免前後端分階段部署期間中斷。
     */
    const meta = responseBody.meta || {};
    const actualVersion = String(meta.apiContractVersion || '').trim();

    if (!actualVersion) {
      return;
    }

    if (!isApiContractCompatible_(
      actualVersion,
      expectedVersion,
      meta.supportedFrontendApiContract || {}
    )) {
      throw createCompatibilityError_(actualVersion, expectedVersion);
    }
  }

  function createTimeoutError_() {
    const error = new Error(
      '伺服器回應逾時。後端操作可能已完成，請重新讀取資料確認後再決定是否重試。'
    );
    error.code = 'REQUEST_TIMEOUT';
    error.isTimeout = true;
    return error;
  }

  function createNetworkError_() {
    const error = new Error(
      '目前無法連接 GAS 後端。請確認網路與 Web App /exec 部署後重新載入；也可先返回登入畫面。'
    );
    error.code = 'NETWORK_ERROR';
    error.isNetworkError = true;
    return error;
  }

  function normalizeTransportError_(error) {
    const message = String(error && error.message || '').trim();

    if (
      error instanceof TypeError ||
      /failed to fetch|networkerror|load failed|network request failed/i.test(message)
    ) {
      return createNetworkError_();
    }

    return error;
  }

  async function invokeViaHttp_(functionName, args) {
    const action = String(functionName || '').trim();
    const url = getApiUrl_(action);

    if (!action) {
      throw new Error('缺少後端函式名稱');
    }

    validateApiUrl_(url);

    const timeoutMs = getRequestTimeoutMs_(action);
    const controller = typeof global.AbortController === 'function'
      ? new global.AbortController()
      : null;
    let timedOut = false;
    let timeoutId = 0;

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8'
      },
      body: JSON.stringify({
        action: action,
        args: Array.isArray(args) ? args : []
      }),
      redirect: 'follow',
      cache: 'no-store',
      credentials: 'omit'
    };

    if (controller) {
      requestOptions.signal = controller.signal;
    }

    const requestPromise = fetch(url, requestOptions)
      .then(async function(response) {
        return {
          response: response,
          text: await response.text()
        };
      });
    const timeoutPromise = new Promise((resolve, reject) => {
      timeoutId = global.setTimeout(() => {
        timedOut = true;

        if (controller) {
          controller.abort();
        }

        reject(createTimeoutError_());
      }, timeoutMs);
    });

    let result;

    try {
      result = await Promise.race([requestPromise, timeoutPromise]);
    } catch (error) {
      if (timedOut || (error && error.name === 'AbortError')) {
        throw createTimeoutError_();
      }

      throw normalizeTransportError_(error);
    } finally {
      if (timeoutId) {
        global.clearTimeout(timeoutId);
      }
    }

    if (!result.response.ok) {
      throw new Error('後端連線失敗（HTTP ' + result.response.status + '）');
    }

    let responseBody;

    try {
      responseBody = JSON.parse(result.text);
    } catch (error) {
      throw new Error(isAdminAction_(action)
        ? '管理後端回傳格式錯誤。請確認管理 GAS Web App 已重新部署，且使用完整 /exec 網址。'
        : '使用者後端回傳格式錯誤。請確認公開 GAS Web App 已重新部署，且使用完整 /exec 網址。');
    }

    validateApiCompatibilityFromResponse_(responseBody);
    return responseBody;
  }

  async function invoke(functionName, args) {
    const action = String(functionName || '').trim();
    if (!action) throw new Error('缺少後端函式名稱');

    validateApiUrl_(getApiUrl_(action));
    if (await waitForBridgeReady_()) {
      return invokeViaBridge_(action, args);
    }

    return invokeViaHttp_(action, args);
  }

  ensureBridge_();

  global.GasBackend = Object.freeze({
    get url() {
      return getApiUrl_();
    },
    invoke: invoke
  });
})(window);
