var APP = {
  TITLE: '선교 바자회 주문',
  VERSION: '2026-05-31',
  ORDER_PREFIX: 'A',
  SHEETS: {
    ORDERS: 'Orders',
    MENUS: 'Menus',
    COUNTERS: 'Counters'
  },
  PROPERTIES: {
    SPREADSHEET_ID: 'SPREADSHEET_ID',
    ADMIN_PIN: 'ADMIN_PIN',
    MASTER_ADMIN_PIN: 'MASTER_ADMIN_PIN',
    BANK_NAME: 'BANK_NAME',
    ACCOUNT_NUMBER: 'ACCOUNT_NUMBER',
    ACCOUNT_HOLDER: 'ACCOUNT_HOLDER',
    QR_IMAGE_URL: 'QR_IMAGE_URL'
  },
  ORDER_HEADERS: [
    'orderId',
    'orderToken',
    'teamId',
    'teamName',
    'createdAt',
    'updatedAt',
    'pickupName',
    'phone',
    'customerKey',
    'itemsText',
    'itemsJson',
    'totalAmount',
    'status',
    'memo',
    'adminNote',
    'statusUpdatedAt',
    'statusUpdatedBy',
    'paymentMethod'
  ],
  MENU_HEADERS: [
    'menuId',
    'teamId',
    'teamName',
    'name',
    'price',
    'category',
    'isAvailable',
    'sortOrder'
  ],
  COUNTER_HEADERS: ['key', 'value', 'updatedAt']
};

var ORDER_COUNTER_PROPERTY_PREFIX = 'ORDER_COUNTER_';

var CACHE_KEYS = {
  SCHEMA_READY: 'schema-ready-v2',
  MENUS: 'menus-v2',
  TEAMS: 'teams-v2',
  SETTINGS: 'settings-v1',
  PICKUP: 'pickup-v2',
  CUSTOMER_PICKUP: 'customer-pickup-v1',
  CUSTOMER_ACCESS: 'customer-access-v1',
  ADMIN_SNAPSHOT: 'admin-snapshot-v1',
  ADMIN_ORDERS: 'admin-orders-v1'
};

var SPREADSHEET_CACHE = null;
var HEADER_MAP_CACHE = {};
var READ_CACHE_VERSION_PROPERTY = 'READ_CACHE_VERSION';
var CUSTOMER_PICKUP_CACHE_SECONDS = 30;
var PERF_LOG_ENABLED = true;

var STATUS_LABELS = {
  PAYMENT_PENDING: '입금 대기',
  PAYMENT_CHECKING: '입금 확인 중',
  PAID: '입금 확인 완료 / 준비 중',
  READY: '준비 완료',
  COMPLETE: '수령 완료',
  PAYMENT_ISSUE: '입금 확인 필요',
  CANCELED: '주문 취소'
};

var STATUS_PRIORITY = {
  PAYMENT_PENDING: 1,
  PAYMENT_CHECKING: 2,
  PAYMENT_ISSUE: 3,
  PAID: 4,
  READY: 5,
  COMPLETE: 6,
  CANCELED: 7
};

var ADMIN_TRANSITIONS = {
  PAYMENT_PENDING: ['PAID'],
  PAYMENT_CHECKING: ['PAID'],
  PAYMENT_ISSUE: ['PAID'],
  PAID: ['READY'],
  READY: ['COMPLETE'],
  COMPLETE: [],
  CANCELED: []
};

function setupKiosk() {
  var ss = getSpreadsheet_();
  clearAppCache_();
  ensureAllSheets_();
  seedMenusIfEmpty_();
  syncOrderCounterProperty_();
  clearAppCache_();
  getPublicBootstrap();

  var props = PropertiesService.getScriptProperties();
  var generatedPin = '';
  if (!props.getProperty(APP.PROPERTIES.ADMIN_PIN)) {
    generatedPin = String(Math.floor(100000 + Math.random() * 900000));
    props.setProperty(APP.PROPERTIES.ADMIN_PIN, generatedPin);
  }

  var result = {
    ok: true,
    spreadsheetUrl: ss.getUrl(),
    adminPin: generatedPin || '(existing PIN kept)',
    nextStep: 'Deploy as a Web App, then open ?page=admin for the admin screen.'
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function doGet(e) {
  e = e || {};
  var params = e.parameter || {};

  if (params.action) {
    ensureAllSheets_();
    return handleGetAction_(params.action, params);
  }

  var page = String(params.page || 'customer').toLowerCase();
  var fileName = 'Index';
  var title = APP.TITLE;

  if (page === 'admin') {
    fileName = 'Admin';
    title = APP.TITLE + ' 관리자';
  } else if (page === 'pickup') {
    fileName = 'Pickup';
    title = APP.TITLE + ' 픽업';
  }

  var template = HtmlService.createTemplateFromFile(fileName);
  template.appTitle = APP.TITLE;
  template.webAppUrl = getWebAppUrl_();
  template.requestParamsJson = safeJson_(params);
  template.initialBootstrapJson = page === 'customer' ? getInitialBootstrapJson_() : 'null';
  template.initialPickupJson = page === 'pickup' ? getInitialPickupJson_() : 'null';
  return template
    .evaluate()
    .setTitle(title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  ensureAllSheets_();
  var body = parsePostBody_(e || {});
  var action = body.action || ((e || {}).parameter || {}).action;

  try {
    var result = handlePostAction_(action, body);
    return json_({ ok: true, data: result });
  } catch (error) {
    return json_({ ok: false, error: publicError_(error) });
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getPublicBootstrap() {
  ensureAllSheets_();
  return {
    appTitle: APP.TITLE,
    version: APP.VERSION,
    menus: getMenus_(),
    teams: getTeams_(),
    settings: getPublicSettings_(),
    statusLabels: STATUS_LABELS
  };
}

function getInitialBootstrapJson_() {
  try {
    return safeJson_(getPublicBootstrap());
  } catch (error) {
    return safeJson_({
      appTitle: APP.TITLE,
      version: APP.VERSION,
      menus: [],
      teams: [],
      settings: getPublicSettings_(),
      statusLabels: STATUS_LABELS,
      error: publicError_(error)
    });
  }
}

function getInitialPickupJson_() {
  try {
    var cached = getCachedJson_(getPickupCacheKey_());
    return cached ? safeJson_(cached) : 'null';
  } catch (error) {
    return safeJson_({
      orders: [],
      teams: [],
      updatedAt: '',
      error: publicError_(error)
    });
  }
}

function createOrder(payload) {
  var perf = startPerf_('createOrder', {
    items: payload && Array.isArray(payload.items) ? payload.items.length : 0
  });
  payload = payload || {};

  try {
    ensureAllSheets_();
    perfStep_(perf, 'ensureAllSheets');

    var menuMap = getMenuMap_();
    perfStep_(perf, 'getMenuMap');
    var built = buildOrderItems_(payload.items || [], menuMap);
    var pickupName = sanitizeText_(payload.pickupName, 40);
    var phone = sanitizeText_(payload.phone, 30);
    var memo = sanitizeText_(payload.memo, 300);
    perfStep_(perf, 'buildAndValidate', {
      teamOrders: built.teamOrders.length,
      totalAmount: built.totalAmount
    });

    if (!pickupName) {
      throw new Error('픽업자명을 입력해주세요.');
    }
    if (!phone) {
      throw new Error('연락처를 입력해주세요.');
    }
    if (!built.items.length) {
      throw new Error('메뉴를 하나 이상 선택해주세요.');
    }

    return withScriptLock_(function () {
      var now = new Date();
      var orderId = nextOrderIdLocked_();
      var orderToken = createOrderToken_();
      var records = [];
      perfStep_(perf, 'nextOrderId', { orderId: orderId });

      for (var i = 0; i < built.teamOrders.length; i += 1) {
        var teamOrder = built.teamOrders[i];
        var record = {
          orderId: orderId,
          orderToken: orderToken,
          teamId: teamOrder.teamId,
          teamName: teamOrder.teamName,
          createdAt: now,
          updatedAt: now,
          pickupName: pickupName,
          phone: phone,
          customerKey: normalizeCustomerKey_(pickupName, phone),
          itemsText: teamOrder.itemsText,
          itemsJson: JSON.stringify(teamOrder.items),
          totalAmount: teamOrder.totalAmount,
          status: 'PAYMENT_PENDING',
          memo: memo,
          adminNote: '',
          statusUpdatedAt: now,
          statusUpdatedBy: 'customer',
          paymentMethod: 'TRANSFER'
        };

        records.push(record);
      }
      perfStep_(perf, 'buildRecords', { rows: records.length });

      appendRecords_(APP.SHEETS.ORDERS, APP.ORDER_HEADERS, records);
      perfStep_(perf, 'appendRecords', { rows: records.length });
      clearOrderReadCaches_();
      perfStep_(perf, 'clearOrderReadCaches');
      var result = serializeOrderGroup_(records, true);
      perfEnd_(perf, { orderId: orderId, rows: records.length });
      return result;
    }, perf);
  } catch (error) {
    perfEnd_(perf, { error: publicError_(error) });
    throw error;
  }
}

function markPaymentChecking(payload) {
  return markPaymentChecking_(payload, true);
}

function markPaymentCheckingFast(payload) {
  return markPaymentChecking_(payload, false);
}

function markPaymentChecking_(payload, includeOrder) {
  payload = payload || {};
  var perf = startPerf_('markPaymentChecking', { includeOrder: Boolean(includeOrder) });
  try {
    ensureAllSheets_();
    perfStep_(perf, 'ensureAllSheets');

    return withScriptLock_(function () {
      var foundRows = findOrdersById_(payload.orderId);
      perfStep_(perf, 'findOrdersById', { rows: foundRows.length });
      if (!foundRows.length) {
        throw new Error('주문을 찾을 수 없습니다.');
      }
      assertPublicOrderAccess_(foundRows[0].record, payload.orderToken);

      var rowsToUpdate = [];
      var now = new Date();
      for (var i = 0; i < foundRows.length; i += 1) {
        var status = normalizeStatus_(foundRows[i].record.status);
        if (status === 'PAYMENT_PENDING') {
          rowsToUpdate.push(foundRows[i].rowNumber);
          foundRows[i].record.status = 'PAYMENT_CHECKING';
          foundRows[i].record.updatedAt = now;
        } else if (status === 'CANCELED' || status === 'COMPLETE') {
          throw new Error('현재 상태에서는 입금 확인 요청을 할 수 없습니다.');
        }
      }

      updateRecordRows_(APP.SHEETS.ORDERS, APP.ORDER_HEADERS, rowsToUpdate, {
        updatedAt: now,
        status: 'PAYMENT_CHECKING',
        statusUpdatedAt: now,
        statusUpdatedBy: 'customer'
      });
      perfStep_(perf, 'updateRows', { rows: rowsToUpdate.length });
      clearOrderReadCaches_();
      perfStep_(perf, 'clearOrderReadCaches');
      if (!includeOrder) {
        perfEnd_(perf, { rows: foundRows.length });
        return {
          orderId: String(foundRows[0].record.orderId || payload.orderId || ''),
          status: 'PAYMENT_CHECKING',
          updatedAt: toIso_(now)
        };
      }
      var result = serializeOrderGroup_(pluckRecords_(foundRows), true);
      perfEnd_(perf, { rows: foundRows.length });
      return result;
    }, perf);
  } catch (error) {
    perfEnd_(perf, { error: publicError_(error) });
    throw error;
  }
}

function getOrderPublic(payload) {
  payload = payload || {};
  ensureAllSheets_();

  var foundRows = findOrdersById_(payload.orderId);
  if (!foundRows.length) {
    throw new Error('주문을 찾을 수 없습니다.');
  }
  assertPublicOrderAccess_(foundRows[0].record, payload.orderToken);
  return serializeOrderGroup_(pluckRecords_(foundRows), true);
}

function getPickupOrder(payload) {
  payload = payload || {};
  var perf = startPerf_('getPickupOrder', {});
  var cacheKey = getOrderPickupCacheKey_(payload);
  var cached = cacheKey ? getCachedJson_(cacheKey) : null;
  perfStep_(perf, 'cacheRead', { cacheHit: Boolean(cached) });
  if (cached) {
    perfEnd_(perf, { cacheHit: true, orders: (cached.orders || []).length });
    return cached;
  }

  try {
    ensureAllSheets_();
    perfStep_(perf, 'ensureAllSheets');

    var foundRows = findOrdersById_(payload.orderId);
    perfStep_(perf, 'findOrdersById', { rows: foundRows.length });
    if (!foundRows.length) {
      throw new Error('주문을 찾을 수 없습니다.');
    }
    assertPublicOrderAccess_(foundRows[0].record, payload.orderToken);

    var records = pluckRecords_(foundRows);
    var teams = [];
    var orders = [];
    for (var i = 0; i < records.length; i += 1) {
      var serialized = serializeOrder_(records[i], false, false);
      teams.push({
        teamId: serialized.teamId,
        teamName: serialized.teamName
      });
      orders.push(serialized);
    }

    var result = {
      order: serializeOrderGroup_(records, true),
      orders: orders,
      teams: uniqueTeams_(teams),
      updatedAt: toIso_(new Date())
    };
    if (cacheKey) {
      putCachedJson_(cacheKey, result, CUSTOMER_PICKUP_CACHE_SECONDS);
    }
    perfEnd_(perf, { cacheHit: false, orders: orders.length });
    return result;
  } catch (error) {
    perfEnd_(perf, { error: publicError_(error) });
    throw error;
  }
}

function refreshPickupOrder(payload) {
  payload = payload || {};
  var perf = startPerf_('refreshPickupOrder', {});
  var cacheKey = getOrderPickupCacheKey_(payload);
  var cached = cacheKey ? getCachedJson_(cacheKey) : null;
  perfStep_(perf, 'cacheRead', { cacheHit: Boolean(cached) });
  if (cached && cached.orders) {
    perfEnd_(perf, { cacheHit: true, orders: cached.orders.length });
    return {
      orders: cached.orders,
      teams: cached.teams || [],
      updatedAt: cached.updatedAt || toIso_(new Date())
    };
  }

  try {
    var foundRows = findOrdersById_(payload.orderId);
    perfStep_(perf, 'findOrdersById', { rows: foundRows.length });
    if (!foundRows.length) {
      throw new Error('주문을 찾을 수 없습니다.');
    }
    assertPublicOrderAccess_(foundRows[0].record, payload.orderToken);

    var records = pluckRecords_(foundRows);
    var teams = [];
    var orders = [];
    for (var i = 0; i < records.length; i += 1) {
      var serialized = serializeOrder_(records[i], false, false);
      teams.push({
        teamId: serialized.teamId,
        teamName: serialized.teamName
      });
      orders.push(serialized);
    }

    var result = {
      orders: orders,
      teams: uniqueTeams_(teams),
      updatedAt: toIso_(new Date())
    };
    if (cacheKey) {
      putCachedJson_(cacheKey, result, CUSTOMER_PICKUP_CACHE_SECONDS);
    }
    perfEnd_(perf, { cacheHit: false, orders: orders.length });
    return result;
  } catch (error) {
    perfEnd_(perf, { error: publicError_(error) });
    throw error;
  }
}

function getPickupOrdersForCustomer(payload) {
  payload = payload || {};
  var refs = Array.isArray(payload.orders) ? payload.orders : [];
  var perf = startPerf_('getPickupOrdersForCustomer', { refs: refs.length });
  var primaryRef = getPrimaryOrderRef_(refs);

  try {
    var accessCacheKey = primaryRef ? getCustomerAccessCacheKey_(primaryRef) : '';
    var accessCached = accessCacheKey ? getCachedJson_(accessCacheKey) : null;
    perfStep_(perf, 'accessCacheRead', { cacheHit: Boolean(accessCached) });
    if (accessCached) {
      perfEnd_(perf, { orders: (accessCached.orders || []).length, accessCacheHit: true });
      return accessCached;
    }

    ensureAllSheets_();
    perfStep_(perf, 'ensureAllSheets');

    var recordsByRow = {};
    var teams = [];
    var customerKey = '';
    var customerName = '';
    var customerPhone = '';

    for (var seedIndex = 0; seedIndex < refs.length && seedIndex < 20; seedIndex += 1) {
      var seedOrderId = sanitizeText_(refs[seedIndex].orderId, 40);
      var seedOrderToken = sanitizeText_(refs[seedIndex].orderToken, 120);
      if (!seedOrderId || !seedOrderToken) {
        continue;
      }
      var seedRows = findOrdersById_(seedOrderId);
      if (!seedRows.length) {
        continue;
      }
      assertPublicOrderAccess_(seedRows[0].record, seedOrderToken);
      customerName = String(seedRows[0].record.pickupName || '');
      customerPhone = String(seedRows[0].record.phone || '');
      customerKey = normalizeCustomerKey_(customerName, customerPhone);
      break;
    }

    perfStep_(perf, 'seedLookup', { hasCustomerKey: Boolean(customerKey), seedIndex: seedIndex });
    if (!customerKey) {
      var emptyResult = {
        orders: [],
        teams: [],
        updatedAt: toIso_(new Date())
      };
      perfEnd_(perf, { orders: 0, cacheHit: false });
      return emptyResult;
    }

    var cacheKey = getCustomerPickupCacheKey_(customerKey);
    var cached = getCachedJson_(cacheKey);
    perfStep_(perf, 'cacheRead', { cacheHit: Boolean(cached) });
    if (cached) {
      if (accessCacheKey) {
        putCachedJson_(accessCacheKey, cached, CUSTOMER_PICKUP_CACHE_SECONDS);
      }
      perfEnd_(perf, { orders: (cached.orders || []).length, cacheHit: true });
      return cached;
    }

    var customerRecords = getOrderRecordsByCustomer_(customerName, customerPhone);
    perfStep_(perf, 'customerOrdersLookup', { customerRows: customerRecords.length });
    for (var c = 0; c < customerRecords.length; c += 1) {
      recordsByRow[customerRecords[c]._rowNumber] = customerRecords[c];
    }

    var records = [];
    for (var rowNumber in recordsByRow) {
      var status = normalizeStatus_(recordsByRow[rowNumber].status);
      if (status === 'CANCELED') {
        continue;
      }
      var serialized = serializeOrder_(recordsByRow[rowNumber], false, false);
      teams.push({
        teamId: serialized.teamId,
        teamName: serialized.teamName
      });
      records.push(serialized);
    }

    records.sort(function (a, b) {
      var statusDiff = pickupStatusPriority_(a.status) - pickupStatusPriority_(b.status);
      if (statusDiff !== 0) {
        return statusDiff;
      }
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    perfStep_(perf, 'serializeAndSort', { orders: records.length });

    var result = {
      orders: records,
      teams: uniqueTeams_(teams),
      updatedAt: toIso_(new Date())
    };
    putCachedJson_(cacheKey, result, CUSTOMER_PICKUP_CACHE_SECONDS);
    if (accessCacheKey) {
      putCachedJson_(accessCacheKey, result, CUSTOMER_PICKUP_CACHE_SECONDS);
    }
    perfEnd_(perf, { orders: records.length, cacheHit: false });
    return result;
  } catch (error) {
    perfEnd_(perf, { error: publicError_(error) });
    throw error;
  }
}

function getPickupOrders() {
  ensureAllSheets_();
  var result = getPickupOrdersSnapshot_();
  result.teams = getTeams_();
  return result;
}

function refreshPickupOrders() {
  ensureAllSheets_();
  return getPickupOrdersSnapshot_();
}

function getPickupOrdersSnapshot_() {
  var perf = startPerf_('getPickupOrdersSnapshot', {});
  var cached = getCachedJson_(getPickupCacheKey_());
  if (cached) {
    perfEnd_(perf, { cacheHit: true, orders: (cached.orders || []).length });
    return cached;
  }
  var records = getOrderRecordsByStatuses_([
    'PAYMENT_CHECKING',
    'PAID',
    'READY'
  ]);
  perfStep_(perf, 'activeStatusLookup', { rows: records.length });
  var pickupOrders = [];

  for (var i = 0; i < records.length; i += 1) {
    var status = normalizeStatus_(records[i].status);
    if (status === 'PAYMENT_CHECKING' || status === 'PAID' || status === 'READY') {
      pickupOrders.push(serializeOrder_(records[i], false, false));
    }
  }

  pickupOrders.sort(function (a, b) {
    var statusDiff = pickupStatusPriority_(a.status) - pickupStatusPriority_(b.status);
    if (statusDiff !== 0) {
      return statusDiff;
    }
    return String(a.updatedAt).localeCompare(String(b.updatedAt));
  });

  var result = {
    orders: pickupOrders,
    updatedAt: toIso_(new Date())
  };
  putCachedJson_(getPickupCacheKey_(), result, 5);
  perfEnd_(perf, { cacheHit: false, orders: pickupOrders.length });
  return result;
}

function completePickup(payload) {
  payload = payload || {};
  ensureAllSheets_();

  return withScriptLock_(function () {
    var orderId = sanitizeText_(payload.orderId, 40);
    var teamId = sanitizeText_(payload.teamId, 80);
    var found = findOrderByIdAndTeam_(orderId, teamId);
    if (!found) {
      throw new Error('주문을 찾을 수 없습니다.');
    }

    var currentStatus = normalizeStatus_(found.record.status);
    if (currentStatus === 'COMPLETE') {
      return getPickupOrders();
    }
    if (currentStatus !== 'READY') {
      throw new Error('준비 완료된 주문만 수령 완료 처리할 수 있습니다.');
    }

    var now = new Date();
    updateOrderRow_(found.rowNumber, {
      updatedAt: now,
      status: 'COMPLETE',
      statusUpdatedAt: now,
      statusUpdatedBy: 'customer'
    });

    clearOrderReadCaches_();
    return getPickupOrders();
  });
}

function getAdminBootstrap(payload) {
  payload = payload || {};
  ensureAllSheets_();
  var session = requireAdmin_(payload.pin);
  return getAdminSnapshot_(session);
}

function refreshAdminOrders(payload) {
  payload = payload || {};
  ensureAllSheets_();
  var session = requireAdmin_(payload.pin);
  return getAdminOrdersSnapshot_(session);
}

function adminUpdateOrderStatus(payload) {
  payload = payload || {};
  ensureAllSheets_();
  var session = requireAdmin_(payload.pin);

  return withScriptLock_(function () {
    var teamId = sanitizeText_(payload.teamId, 80);
    assertAdminCanAccessTeam_(session, teamId);
    var found = findOrderByIdAndTeam_(payload.orderId, teamId);
    if (!found) {
      throw new Error('주문을 찾을 수 없습니다.');
    }

    var currentStatus = normalizeStatus_(found.record.status);
    var nextStatus = normalizeStatus_(payload.status);
    if (!canTransition_(currentStatus, nextStatus)) {
      throw new Error(currentStatus + '에서 ' + nextStatus + '로 변경할 수 없습니다.');
    }

    var note = sanitizeText_(payload.adminNote, 500);
    var now = new Date();
    var updater = getAdminActor_();
    var rowsToUpdate = getRowsForStatusUpdate_(payload.orderId, teamId, nextStatus);
    for (var i = 0; i < rowsToUpdate.length; i += 1) {
      updateOrderRow_(rowsToUpdate[i].rowNumber, {
        updatedAt: now,
        status: nextStatus,
        adminNote: note || rowsToUpdate[i].record.adminNote || '',
        statusUpdatedAt: now,
        statusUpdatedBy: updater,
        paymentMethod: payload.paymentMethod || rowsToUpdate[i].record.paymentMethod || 'TRANSFER'
      });
    }

    clearOrderReadCaches_();
    return getAdminOrdersSnapshot_(session);
  });
}

function adminUpdateMenuAvailability(payload) {
  payload = payload || {};
  ensureAllSheets_();
  var session = requireAdmin_(payload.pin);

  var menuId = sanitizeText_(payload.menuId, 80);
  var found = findMenuById_(menuId);
  if (!found) {
    throw new Error('메뉴를 찾을 수 없습니다.');
  }
  var menu = normalizeMenu_(found.record);
  assertAdminCanAccessTeam_(session, menu.teamId);

  updateRecordRow_(APP.SHEETS.MENUS, APP.MENU_HEADERS, found.rowNumber, {
    isAvailable: payload.isAvailable ? 'TRUE' : 'FALSE'
  });
  clearMenusCache_();
  clearOrderReadCaches_();

  return {
    menus: filterMenusForSession_(getMenus_(), session)
  };
}

function handleGetAction_(action, params) {
  try {
    if (action === 'menus') {
      return json_({ ok: true, data: getPublicBootstrap() });
    }
    if (action === 'order') {
      return json_({ ok: true, data: getOrderPublic(params) });
    }
    if (action === 'pickup') {
      return json_({ ok: true, data: getPickupOrders() });
    }
    if (action === 'markPaymentCheckingBeacon') {
      return json_({ ok: true, data: markPaymentCheckingFast(params) });
    }
    return json_({ ok: false, error: 'Unknown action.' });
  } catch (error) {
    return json_({ ok: false, error: publicError_(error) });
  }
}

function handlePostAction_(action, body) {
  if (action === 'createOrder') {
    return createOrder(body);
  }
  if (action === 'markPaymentChecking') {
    return markPaymentChecking(body);
  }
  if (action === 'markPaymentCheckingFast') {
    return markPaymentCheckingFast(body);
  }
  if (action === 'getOrder') {
    return getOrderPublic(body);
  }
  if (action === 'getPickupOrder') {
    return getPickupOrder(body);
  }
  if (action === 'refreshPickupOrder') {
    return refreshPickupOrder(body);
  }
  if (action === 'getPickupOrdersForCustomer') {
    return getPickupOrdersForCustomer(body);
  }
  if (action === 'adminBootstrap') {
    return getAdminBootstrap(body);
  }
  if (action === 'refreshAdminOrders') {
    return refreshAdminOrders(body);
  }
  if (action === 'adminUpdateOrderStatus') {
    return adminUpdateOrderStatus(body);
  }
  if (action === 'adminUpdateMenuAvailability') {
    return adminUpdateMenuAvailability(body);
  }
  if (action === 'completePickup') {
    return completePickup(body);
  }
  if (action === 'pickup') {
    return getPickupOrders();
  }
  if (action === 'refreshPickupOrders') {
    return refreshPickupOrders();
  }

  throw new Error('Unknown action.');
}

function getAdminSnapshot_(session) {
  var cacheKey = getAdminSnapshotCacheKey_(session);
  var cached = getCachedJson_(cacheKey);
  if (cached) {
    return cached;
  }

  var ordersSnapshot = getAdminOrdersSnapshot_(session);
  var snapshot = {
    orders: ordersSnapshot.orders,
    menus: filterMenusForSession_(getMenus_(), session),
    teams: filterTeamsForSession_(getTeams_(), session),
    stats: ordersSnapshot.stats,
    statusLabels: STATUS_LABELS,
    transitions: ADMIN_TRANSITIONS,
    settings: getPublicSettings_(),
    admin: session,
    updatedAt: ordersSnapshot.updatedAt
  };
  putCachedJson_(cacheKey, snapshot, 5);
  return snapshot;
}

function getAdminOrdersSnapshot_(session) {
  var cacheKey = getAdminOrdersCacheKey_(session);
  var cached = getCachedJson_(cacheKey);
  if (cached) {
    return cached;
  }

  var records = getOrderRecordsByStatuses_([
    'PAYMENT_PENDING',
    'PAYMENT_CHECKING',
    'PAYMENT_ISSUE',
    'PAID',
    'READY'
  ]);
  var orders = [];
  var stats = {};
  var statusKey;

  for (statusKey in STATUS_LABELS) {
    stats[statusKey] = 0;
  }

  for (var i = 0; i < records.length; i += 1) {
    var serialized = serializeOrder_(records[i], false, true);
    if (!adminCanAccessTeam_(session, serialized.teamId)) {
      continue;
    }
    stats[serialized.status] = (stats[serialized.status] || 0) + 1;
    orders.push(serialized);
  }

  orders.sort(function (a, b) {
    var priorityDiff = (STATUS_PRIORITY[a.status] || 99) - (STATUS_PRIORITY[b.status] || 99);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });

  var snapshot = {
    orders: orders,
    stats: stats,
    admin: session,
    updatedAt: toIso_(new Date())
  };
  putCachedJson_(cacheKey, snapshot, 5);
  return snapshot;
}

function buildOrderItems_(rawItems, menuMap) {
  if (!Array.isArray(rawItems)) {
    throw new Error('주문 항목 형식이 올바르지 않습니다.');
  }

  var quantities = {};
  for (var i = 0; i < rawItems.length; i += 1) {
    var menuId = sanitizeText_(rawItems[i].menuId, 80);
    var quantity = parseInteger_(rawItems[i].quantity, 0);
    if (!menuId || quantity <= 0) {
      continue;
    }
    if (quantity > 99) {
      throw new Error('한 메뉴는 최대 99개까지 주문할 수 있습니다.');
    }
    quantities[menuId] = (quantities[menuId] || 0) + quantity;
  }

  var items = [];
  var totalAmount = 0;
  var itemLines = [];
  var teamOrdersById = {};
  var teamOrderList = [];

  for (var id in quantities) {
    var menu = menuMap[id];
    if (!menu) {
      throw new Error('존재하지 않는 메뉴가 포함되어 있습니다: ' + id);
    }
    if (!menu.isAvailable) {
      throw new Error(menu.name + '은(는) 현재 품절입니다.');
    }

    if (!teamOrdersById[menu.teamId]) {
      teamOrdersById[menu.teamId] = {
        teamId: menu.teamId,
        teamName: menu.teamName,
        items: [],
        itemLines: [],
        totalAmount: 0
      };
      teamOrderList.push(teamOrdersById[menu.teamId]);
    }

    var qty = quantities[id];
    var subtotal = menu.price * qty;
    totalAmount += subtotal;
    var item = {
      menuId: menu.menuId,
      teamId: menu.teamId,
      teamName: menu.teamName,
      name: menu.name,
      price: menu.price,
      quantity: qty,
      subtotal: subtotal
    };
    items.push(item);
    itemLines.push(menu.name + ' x ' + qty + ' = ' + formatWon_(subtotal));
    teamOrdersById[menu.teamId].items.push(item);
    teamOrdersById[menu.teamId].itemLines.push(menu.name + ' x ' + qty + ' = ' + formatWon_(subtotal));
    teamOrdersById[menu.teamId].totalAmount += subtotal;
  }

  for (var j = 0; j < teamOrderList.length; j += 1) {
    teamOrderList[j].itemsText = teamOrderList[j].itemLines.join('\n');
    delete teamOrderList[j].itemLines;
  }

  return {
    items: items,
    itemsText: itemLines.join('\n'),
    totalAmount: totalAmount,
    teamOrders: teamOrderList
  };
}

function getMenus_() {
  var cached = getCachedJson_(CACHE_KEYS.MENUS);
  if (cached) {
    return cached;
  }

  var records = getRecords_(APP.SHEETS.MENUS, APP.MENU_HEADERS);
  var menus = [];

  for (var i = 0; i < records.length; i += 1) {
    if (!records[i].menuId) {
      continue;
    }
    menus.push(normalizeMenu_(records[i]));
  }

  menus.sort(function (a, b) {
    var sortDiff = a.sortOrder - b.sortOrder;
    if (sortDiff !== 0) {
      return sortDiff;
    }
    return String(a.name).localeCompare(String(b.name));
  });

  putCachedJson_(CACHE_KEYS.MENUS, menus, 3600);
  return menus;
}

function getTeams_() {
  var cached = getCachedJson_(CACHE_KEYS.TEAMS);
  if (cached) {
    return cached;
  }

  var menus = getMenus_();
  var seen = {};
  var teams = [];

  for (var i = 0; i < menus.length; i += 1) {
    if (seen[menus[i].teamId]) {
      continue;
    }
    seen[menus[i].teamId] = true;
    teams.push({
      teamId: menus[i].teamId,
      teamName: menus[i].teamName
    });
  }

  teams.sort(function (a, b) {
    return String(a.teamName).localeCompare(String(b.teamName), 'ko');
  });

  putCachedJson_(CACHE_KEYS.TEAMS, teams, 3600);
  return teams;
}

function getMenuMap_() {
  var menus = getMenus_();
  var map = {};
  for (var i = 0; i < menus.length; i += 1) {
    map[menus[i].menuId] = menus[i];
  }
  return map;
}

function normalizeMenu_(record) {
  return {
    menuId: String(record.menuId || '').trim(),
    teamId: normalizeTeamId_(record.teamId || record.teamName || 'team-1'),
    teamName: String(record.teamName || record.teamId || '제주팀').trim(),
    name: String(record.name || '').trim(),
    price: parseInteger_(record.price, 0),
    category: String(record.category || '기타').trim(),
    isAvailable: parseAvailability_(record.isAvailable),
    sortOrder: parseInteger_(record.sortOrder, 999)
  };
}

function findMenuById_(menuId) {
  var records = getRecords_(APP.SHEETS.MENUS, APP.MENU_HEADERS);
  for (var i = 0; i < records.length; i += 1) {
    if (String(records[i].menuId) === String(menuId)) {
      return {
        rowNumber: records[i]._rowNumber,
        record: records[i]
      };
    }
  }
  return null;
}

function findOrderById_(orderId) {
  var foundRows = findOrdersById_(orderId);
  return foundRows.length ? foundRows[0] : null;
}

function findOrdersById_(orderId) {
  var normalized = String(orderId || '').trim().toUpperCase();
  var found = [];
  if (!normalized) {
    return found;
  }

  var sheet = ensureSheet_(APP.SHEETS.ORDERS, APP.ORDER_HEADERS);
  var headerMap = getHeaderMap_(sheet);
  var orderIdIndex = headerMap.index.orderId;
  var lastRow = sheet.getLastRow();
  if (orderIdIndex === undefined || lastRow < 2) {
    return found;
  }

  var matches = sheet
    .getRange(2, orderIdIndex + 1, lastRow - 1, 1)
    .createTextFinder(normalized)
    .matchEntireCell(true)
    .matchCase(false)
    .findAll();

  for (var i = 0; i < matches.length; i += 1) {
    var rowNumber = matches[i].getRow();
    found.push({
      rowNumber: rowNumber,
      record: getRecordAtRow_(sheet, rowNumber)
    });
  }
  return found;
}

function findOrderByIdAndTeam_(orderId, teamId) {
  var foundRows = findOrdersById_(orderId);
  var normalizedTeamId = normalizeTeamId_(teamId);
  for (var i = 0; i < foundRows.length; i += 1) {
    if (normalizeTeamId_(foundRows[i].record.teamId || foundRows[i].record.teamName) === normalizedTeamId) {
      return foundRows[i];
    }
  }
  return null;
}

function getRowsForStatusUpdate_(orderId, teamId, nextStatus) {
  var found = findOrderByIdAndTeam_(orderId, teamId);
  return found ? [found] : [];
}

function pluckRecords_(foundRows) {
  var records = [];
  for (var i = 0; i < foundRows.length; i += 1) {
    records.push(foundRows[i].record);
  }
  return records;
}

function serializeOrder_(record, includeToken, includePrivate) {
  var status = normalizeStatus_(record.status);
  var serialized = {
    orderId: String(record.orderId || ''),
    teamId: normalizeTeamId_(record.teamId || record.teamName || 'team-1'),
    teamName: String(record.teamName || record.teamId || '제주팀'),
    createdAt: toIso_(record.createdAt),
    updatedAt: toIso_(record.updatedAt),
    itemsText: String(record.itemsText || ''),
    totalAmount: parseInteger_(record.totalAmount, 0),
    status: status,
    statusLabel: STATUS_LABELS[status] || status,
    memo: String(record.memo || '')
  };

  if (includeToken) {
    serialized.items = parseJsonArray_(record.itemsJson);
    serialized.orderToken = String(record.orderToken || '');
    serialized.pickupName = String(record.pickupName || '');
    serialized.payment = getPublicSettings_();
  }

  if (includePrivate) {
    serialized.pickupName = String(record.pickupName || '');
    serialized.phone = String(record.phone || '');
    serialized.adminNote = String(record.adminNote || '');
    serialized.statusUpdatedAt = toIso_(record.statusUpdatedAt);
    serialized.statusUpdatedBy = String(record.statusUpdatedBy || '');
    serialized.paymentMethod = String(record.paymentMethod || 'TRANSFER');
  }

  return serialized;
}

function serializeOrderGroup_(records, includeToken) {
  var first = records[0] || {};
  var items = [];
  var itemsText = [];
  var totalAmount = 0;
  var teamNames = [];

  for (var i = 0; i < records.length; i += 1) {
    var recordItems = parseJsonArray_(records[i].itemsJson);
    for (var j = 0; j < recordItems.length; j += 1) {
      items.push(recordItems[j]);
    }
    if (records[i].itemsText) {
      itemsText.push(String(records[i].teamName || '') + '\n' + String(records[i].itemsText || ''));
    }
    totalAmount += parseInteger_(records[i].totalAmount, 0);
    if (records[i].teamName) {
      teamNames.push(String(records[i].teamName));
    }
  }

  var status = aggregateGroupStatus_(records);
  var serialized = {
    orderId: String(first.orderId || ''),
    teamId: records.length > 1 ? 'multi' : normalizeTeamId_(first.teamId || first.teamName || 'team-1'),
    teamName: unique_(teamNames).join(' / '),
    createdAt: toIso_(first.createdAt),
    updatedAt: toIso_(first.updatedAt),
    itemsText: itemsText.join('\n\n'),
    items: items,
    totalAmount: totalAmount,
    status: status,
    statusLabel: STATUS_LABELS[status] || status,
    memo: String(first.memo || '')
  };

  if (includeToken) {
    serialized.orderToken = String(first.orderToken || '');
    serialized.pickupName = String(first.pickupName || '');
    serialized.phone = String(first.phone || '');
    serialized.payment = getPublicSettings_();
  }

  return serialized;
}

function aggregateGroupStatus_(records) {
  var statuses = {};
  for (var i = 0; i < records.length; i += 1) {
    statuses[normalizeStatus_(records[i].status)] = true;
  }

  if (statuses.PAYMENT_ISSUE) return 'PAYMENT_ISSUE';
  if (statuses.CANCELED) return 'CANCELED';
  if (statuses.PAYMENT_PENDING) return 'PAYMENT_PENDING';
  if (statuses.PAYMENT_CHECKING) return 'PAYMENT_CHECKING';
  if (statuses.PAID) return 'PAID';
  if (statuses.READY) return 'READY';
  if (statuses.COMPLETE) return 'COMPLETE';
  return 'PAYMENT_PENDING';
}

function unique_(values) {
  var seen = {};
  var result = [];
  for (var i = 0; i < values.length; i += 1) {
    if (!values[i] || seen[values[i]]) {
      continue;
    }
    seen[values[i]] = true;
    result.push(values[i]);
  }
  return result;
}

function uniqueTeams_(teams) {
  var seen = {};
  var result = [];
  for (var i = 0; i < teams.length; i += 1) {
    var teamId = normalizeTeamId_(teams[i].teamId || teams[i].teamName);
    if (!teamId || seen[teamId]) {
      continue;
    }
    seen[teamId] = true;
    result.push({
      teamId: teamId,
      teamName: String(teams[i].teamName || teams[i].teamId || teamId)
    });
  }
  return result;
}

function assertPublicOrderAccess_(record, token) {
  var expected = String(record.orderToken || '');
  var actual = String(token || '');
  if (!expected || !actual || expected !== actual) {
    throw new Error('주문 조회 권한을 확인할 수 없습니다. 주문 직후 화면에서 다시 시도해주세요.');
  }
}

function requireAdmin_(pin) {
  var session = getAdminSession_(pin);
  if (!session) {
    throw new Error('관리자 PIN이 설정되지 않았습니다. Apps Script 편집기에서 setupKiosk를 먼저 실행하세요.');
  }
  if (!session.ok) {
    throw new Error('관리자 PIN이 올바르지 않습니다.');
  }
  return session;
}

function getAdminSession_(pin) {
  var input = String(pin || '');
  var props = PropertiesService.getScriptProperties();
  var propValues = props.getProperties ? props.getProperties() : null;
  var masterPin = getPropertyFromValues_(props, propValues, APP.PROPERTIES.ADMIN_PIN) ||
    getPropertyFromValues_(props, propValues, APP.PROPERTIES.MASTER_ADMIN_PIN);

  if (!masterPin) {
    return null;
  }
  if (input === String(masterPin)) {
    return {
      ok: true,
      role: 'master',
      teamId: '',
      teamName: '통합관리'
    };
  }

  var teams = getTeams_();
  for (var i = 0; i < teams.length; i += 1) {
    var candidates = getTeamPinPropertyNames_(teams[i]);
    for (var j = 0; j < candidates.length; j += 1) {
      var teamPin = getPropertyFromValues_(props, propValues, candidates[j]);
      if (teamPin && input === String(teamPin)) {
        return {
          ok: true,
          role: 'team',
          teamId: teams[i].teamId,
          teamName: teams[i].teamName
        };
      }
    }
  }

  return { ok: false };
}

function getPropertyFromValues_(props, propValues, key) {
  return propValues ? propValues[key] : props.getProperty(key);
}

function getTeamPinPropertyNames_(team) {
  var teamIdSuffix = toPropertySuffix_(team.teamId);
  var teamNameSuffix = toPropertySuffix_(team.teamName);
  return unique_([
    teamIdSuffix + '_ADMIN_PIN',
    'ADMIN_PIN_' + teamIdSuffix,
    'TEAM_PIN_' + teamIdSuffix,
    teamIdSuffix + '_PIN',
    teamNameSuffix + '_ADMIN_PIN',
    'ADMIN_PIN_' + teamNameSuffix,
    'TEAM_PIN_' + teamNameSuffix,
    teamNameSuffix + '_PIN'
  ]);
}

function adminCanAccessTeam_(session, teamId) {
  if (!session || !session.ok) {
    return false;
  }
  if (session.role === 'master') {
    return true;
  }
  return normalizeTeamId_(session.teamId) === normalizeTeamId_(teamId);
}

function assertAdminCanAccessTeam_(session, teamId) {
  if (!adminCanAccessTeam_(session, teamId)) {
    throw new Error('이 팀을 관리할 권한이 없습니다.');
  }
}

function filterMenusForSession_(menus, session) {
  var result = [];
  for (var i = 0; i < menus.length; i += 1) {
    if (adminCanAccessTeam_(session, menus[i].teamId)) {
      result.push(menus[i]);
    }
  }
  return result;
}

function filterTeamsForSession_(teams, session) {
  var result = [];
  for (var i = 0; i < teams.length; i += 1) {
    if (adminCanAccessTeam_(session, teams[i].teamId)) {
      result.push(teams[i]);
    }
  }
  return result;
}

function getAdminActor_() {
  try {
    var email = Session.getActiveUser().getEmail();
    return email || 'admin';
  } catch (error) {
    return 'admin';
  }
}

function canTransition_(currentStatus, nextStatus) {
  currentStatus = normalizeStatus_(currentStatus);
  nextStatus = normalizeStatus_(nextStatus);
  if (currentStatus === nextStatus) {
    return true;
  }
  var nextStatuses = ADMIN_TRANSITIONS[currentStatus] || [];
  for (var i = 0; i < nextStatuses.length; i += 1) {
    if (nextStatuses[i] === nextStatus) {
      return true;
    }
  }
  return false;
}

function pickupStatusPriority_(status) {
  status = normalizeStatus_(status);
  if (status === 'READY') {
    return 1;
  }
  if (status === 'PAID') {
    return 2;
  }
  if (status === 'PAYMENT_CHECKING') {
    return 3;
  }
  return 99;
}

function normalizeStatus_(status) {
  var normalized = String(status || '').trim().toUpperCase();
  return STATUS_LABELS[normalized] ? normalized : 'PAYMENT_PENDING';
}

function nextOrderIdLocked_() {
  var props = PropertiesService.getScriptProperties();
  var propertyKey = getOrderCounterPropertyKey_();
  var current = parseInteger_(props.getProperty(propertyKey), 0);
  if (current < 1) {
    current = computeMaxOrderNumber_();
  }
  var next = current + 1;
  props.setProperty(propertyKey, String(next));
  return formatOrderId_(APP.ORDER_PREFIX, next);
}

function syncOrderCounterProperty_() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(getOrderCounterPropertyKey_(), String(computeMaxOrderNumber_()));
}

function getOrderCounterPropertyKey_() {
  return ORDER_COUNTER_PROPERTY_PREFIX + APP.ORDER_PREFIX;
}

function computeMaxOrderNumber_() {
  var records = getRecords_(APP.SHEETS.ORDERS, APP.ORDER_HEADERS);
  var max = 0;
  var prefix = APP.ORDER_PREFIX;

  for (var i = 0; i < records.length; i += 1) {
    var id = String(records[i].orderId || '');
    if (id.indexOf(prefix) !== 0) {
      continue;
    }
    var n = parseInteger_(id.substring(prefix.length), 0);
    if (n > max) {
      max = n;
    }
  }

  return max;
}

function formatOrderId_(prefix, number) {
  var digits = String(number);
  while (digits.length < 3) {
    digits = '0' + digits;
  }
  return String(prefix || 'A') + digits;
}

function getCounterValue_(key) {
  var found = findCounter_(key);
  if (!found) {
    return 0;
  }
  return parseInteger_(found.record.value, 0);
}

function setCounterValue_(key, value) {
  var found = findCounter_(key);
  var now = new Date();
  if (found) {
    updateRecordRow_(APP.SHEETS.COUNTERS, APP.COUNTER_HEADERS, found.rowNumber, {
      value: value,
      updatedAt: now
    });
  } else {
    appendRecord_(APP.SHEETS.COUNTERS, APP.COUNTER_HEADERS, {
      key: key,
      value: value,
      updatedAt: now
    });
  }
}

function findCounter_(key) {
  var records = getRecords_(APP.SHEETS.COUNTERS, APP.COUNTER_HEADERS);
  for (var i = 0; i < records.length; i += 1) {
    if (String(records[i].key) === String(key)) {
      return {
        rowNumber: records[i]._rowNumber,
        record: records[i]
      };
    }
  }
  return null;
}

function updateOrderRow_(rowNumber, values) {
  updateRecordRow_(APP.SHEETS.ORDERS, APP.ORDER_HEADERS, rowNumber, values);
}

function getSpreadsheet_() {
  if (SPREADSHEET_CACHE) {
    return SPREADSHEET_CACHE;
  }

  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty(APP.PROPERTIES.SPREADSHEET_ID);

  if (spreadsheetId) {
    SPREADSHEET_CACHE = SpreadsheetApp.openById(spreadsheetId);
    return SPREADSHEET_CACHE;
  }

  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    props.setProperty(APP.PROPERTIES.SPREADSHEET_ID, active.getId());
    SPREADSHEET_CACHE = active;
    return SPREADSHEET_CACHE;
  }

  var created = SpreadsheetApp.create(APP.TITLE + ' DB');
  props.setProperty(APP.PROPERTIES.SPREADSHEET_ID, created.getId());
  SPREADSHEET_CACHE = created;
  return SPREADSHEET_CACHE;
}

function ensureAllSheets_() {
  var scriptCache = CacheService.getScriptCache();
  if (scriptCache.get(CACHE_KEYS.SCHEMA_READY)) {
    return;
  }

  ensureSheet_(APP.SHEETS.ORDERS, APP.ORDER_HEADERS);
  ensureSheet_(APP.SHEETS.MENUS, APP.MENU_HEADERS);
  scriptCache.put(CACHE_KEYS.SCHEMA_READY, '1', 21600);
}

function ensureSheet_(sheetName, headers) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var existing = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var present = {};
  for (var i = 0; i < existing.length; i += 1) {
    if (existing[i]) {
      present[String(existing[i])] = true;
    }
  }

  var missing = [];
  for (var j = 0; j < headers.length; j += 1) {
    if (!present[headers[j]]) {
      missing.push(headers[j]);
    }
  }

  if (missing.length) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
    delete HEADER_MAP_CACHE[sheetName];
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function seedMenusIfEmpty_() {
  var records = getRecords_(APP.SHEETS.MENUS, APP.MENU_HEADERS);
  if (records.length) {
    return;
  }

  appendRecord_(APP.SHEETS.MENUS, APP.MENU_HEADERS, {
    menuId: 'food-001',
    teamId: 'team-1',
    teamName: '제주팀',
    name: '김밥',
    price: 3000,
    category: '음식',
    isAvailable: 'TRUE',
    sortOrder: 1
  });
  appendRecord_(APP.SHEETS.MENUS, APP.MENU_HEADERS, {
    menuId: 'food-002',
    teamId: 'team-1',
    teamName: '제주팀',
    name: '떡볶이',
    price: 4000,
    category: '음식',
    isAvailable: 'TRUE',
    sortOrder: 2
  });
  appendRecord_(APP.SHEETS.MENUS, APP.MENU_HEADERS, {
    menuId: 'drink-001',
    teamId: 'team-2',
    teamName: '영주팀',
    name: '아이스티',
    price: 2000,
    category: '음료',
    isAvailable: 'TRUE',
    sortOrder: 3
  });
}

function getRecords_(sheetName, headers) {
  var sheet = ensureSheet_(sheetName, headers);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 2) {
    return [];
  }

  var sheetHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  var records = [];

  for (var r = 0; r < values.length; r += 1) {
    var row = values[r];
    var isEmpty = true;
    var record = { _rowNumber: r + 2 };
    for (var c = 0; c < sheetHeaders.length; c += 1) {
      var header = String(sheetHeaders[c] || '');
      if (!header) {
        continue;
      }
      record[header] = row[c];
      if (row[c] !== '' && row[c] !== null) {
        isEmpty = false;
      }
    }
    if (!isEmpty) {
      records.push(record);
    }
  }

  return records;
}

function getOrderRecordsByStatuses_(statuses) {
  var allowed = {};
  for (var i = 0; i < statuses.length; i += 1) {
    allowed[normalizeStatus_(statuses[i])] = true;
  }
  return getRecordsByColumnValues_(APP.SHEETS.ORDERS, APP.ORDER_HEADERS, 'status', allowed, normalizeStatus_);
}

function getOrderRecordsByCustomer_(pickupName, phone) {
  var customerKey = normalizeCustomerKey_(pickupName, phone);
  if (!customerKey) {
    return [];
  }

  var sheet = ensureSheet_(APP.SHEETS.ORDERS, APP.ORDER_HEADERS);
  var headerMap = getHeaderMap_(sheet);
  var pickupNameIndex = headerMap.index.pickupName;
  var phoneIndex = headerMap.index.phone;
  var customerKeyIndex = headerMap.index.customerKey;
  var lastRow = sheet.getLastRow();
  if (pickupNameIndex === undefined || phoneIndex === undefined || lastRow < 2) {
    return [];
  }

  if (customerKeyIndex !== undefined) {
    var matches = sheet
      .getRange(2, customerKeyIndex + 1, lastRow - 1, 1)
      .createTextFinder(customerKey)
      .matchEntireCell(true)
      .matchCase(false)
      .findAll();
    var matchedRowNumbers = [];
    for (var m = 0; m < matches.length; m += 1) {
      matchedRowNumbers.push(matches[m].getRow());
    }
    if (matchedRowNumbers.length) {
      return getRecordsAtRows_(sheet, matchedRowNumbers);
    }
  }

  var pickupNames = sheet.getRange(2, pickupNameIndex + 1, lastRow - 1, 1).getValues();
  var phones = sheet.getRange(2, phoneIndex + 1, lastRow - 1, 1).getValues();
  var rowNumbers = [];

  for (var i = 0; i < pickupNames.length; i += 1) {
    if (normalizeCustomerKey_(pickupNames[i][0], phones[i][0]) === customerKey) {
      rowNumbers.push(i + 2);
    }
  }

  return getRecordsAtRows_(sheet, rowNumbers);
}

function getRecordsByColumnValues_(sheetName, headers, columnName, allowedValues, normalizer) {
  var sheet = ensureSheet_(sheetName, headers);
  var headerMap = getHeaderMap_(sheet);
  var columnIndex = headerMap.index[columnName];
  var lastRow = sheet.getLastRow();
  if (columnIndex === undefined || lastRow < 2) {
    return [];
  }

  var values = sheet.getRange(2, columnIndex + 1, lastRow - 1, 1).getValues();
  var rowNumbers = [];
  for (var i = 0; i < values.length; i += 1) {
    var value = normalizer ? normalizer(values[i][0]) : String(values[i][0] || '');
    if (allowedValues[value]) {
      rowNumbers.push(i + 2);
    }
  }

  return getRecordsAtRows_(sheet, rowNumbers);
}

function getRecordsAtRows_(sheet, rowNumbers) {
  if (!rowNumbers.length) {
    return [];
  }

  var records = [];
  var headerMap = getHeaderMap_(sheet);
  var startRow = rowNumbers[0];
  var previousRow = rowNumbers[0];

  for (var i = 1; i <= rowNumbers.length; i += 1) {
    var rowNumber = rowNumbers[i];
    if (rowNumber === previousRow + 1) {
      previousRow = rowNumber;
      continue;
    }

    var groupValues = sheet.getRange(startRow, 1, previousRow - startRow + 1, headerMap.headers.length).getValues();
    for (var r = 0; r < groupValues.length; r += 1) {
      records.push(createRecordFromRowValues_(headerMap.headers, groupValues[r], startRow + r));
    }

    startRow = rowNumber;
    previousRow = rowNumber;
  }

  return records;
}

function getRecordAtRow_(sheet, rowNumber) {
  var headerMap = getHeaderMap_(sheet);
  var values = sheet.getRange(rowNumber, 1, 1, headerMap.headers.length).getValues()[0];
  return createRecordFromRowValues_(headerMap.headers, values, rowNumber);
}

function createRecordFromRowValues_(headers, values, rowNumber) {
  var record = { _rowNumber: rowNumber };

  for (var i = 0; i < headers.length; i += 1) {
    var header = String(headers[i] || '');
    if (header) {
      record[header] = values[i];
    }
  }

  return record;
}

function appendRecord_(sheetName, headers, record) {
  var sheet = ensureSheet_(sheetName, headers);
  var headerMap = getHeaderMap_(sheet);
  var row = [];
  for (var i = 0; i < headerMap.headers.length; i += 1) {
    row.push(record[headerMap.headers[i]] !== undefined ? record[headerMap.headers[i]] : '');
  }
  sheet.appendRow(row);
}

function appendRecords_(sheetName, headers, records) {
  if (!records.length) {
    return [];
  }
  var sheet = ensureSheet_(sheetName, headers);
  var headerMap = getHeaderMap_(sheet);
  var rows = [];

  for (var r = 0; r < records.length; r += 1) {
    var row = [];
    for (var c = 0; c < headerMap.headers.length; c += 1) {
      row.push(records[r][headerMap.headers[c]] !== undefined ? records[r][headerMap.headers[c]] : '');
    }
    rows.push(row);
  }

  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, headerMap.headers.length).setValues(rows);
  var rowNumbers = [];
  for (var rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    rowNumbers.push(startRow + rowIndex);
  }
  return rowNumbers;
}

function updateRecordRow_(sheetName, headers, rowNumber, values) {
  var sheet = ensureSheet_(sheetName, headers);
  var headerMap = getHeaderMap_(sheet);
  var range = sheet.getRange(rowNumber, 1, 1, headerMap.headers.length);
  var row = range.getValues()[0];

  for (var key in values) {
    if (headerMap.index[key] === undefined) {
      continue;
    }
    row[headerMap.index[key]] = values[key];
  }

  range.setValues([row]);
}

function updateRecordRows_(sheetName, headers, rowNumbers, values) {
  if (!rowNumbers.length) {
    return;
  }

  var sheet = ensureSheet_(sheetName, headers);
  var headerMap = getHeaderMap_(sheet);
  rowNumbers = rowNumbers.slice().sort(function (a, b) {
    return a - b;
  });

  var startRow = rowNumbers[0];
  var previousRow = rowNumbers[0];
  for (var i = 1; i <= rowNumbers.length; i += 1) {
    var rowNumber = rowNumbers[i];
    if (rowNumber === previousRow + 1) {
      previousRow = rowNumber;
      continue;
    }

    updateRecordRowRange_(sheet, headerMap, startRow, previousRow, values);
    startRow = rowNumber;
    previousRow = rowNumber;
  }
}

function updateRecordRowRange_(sheet, headerMap, startRow, endRow, values) {
  var range = sheet.getRange(startRow, 1, endRow - startRow + 1, headerMap.headers.length);
  var rows = range.getValues();

  for (var r = 0; r < rows.length; r += 1) {
    for (var key in values) {
      if (headerMap.index[key] !== undefined) {
        rows[r][headerMap.index[key]] = values[key];
      }
    }
  }

  range.setValues(rows);
}

function getHeaderMap_(sheet) {
  var sheetName = sheet.getName();
  if (HEADER_MAP_CACHE[sheetName]) {
    return HEADER_MAP_CACHE[sheetName];
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var index = {};
  for (var i = 0; i < headers.length; i += 1) {
    if (headers[i]) {
      index[String(headers[i])] = i;
    }
  }
  HEADER_MAP_CACHE[sheetName] = {
    headers: headers,
    index: index
  };
  return HEADER_MAP_CACHE[sheetName];
}

function withScriptLock_(callback, perf) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  perfStep_(perf, 'lockWait');
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function getPublicSettings_() {
  var cached = getCachedJson_(CACHE_KEYS.SETTINGS);
  if (cached) {
    return cached;
  }

  var settings = {
    bankName: getProperty_(APP.PROPERTIES.BANK_NAME, '은행명을 설정해주세요'),
    accountNumber: getProperty_(APP.PROPERTIES.ACCOUNT_NUMBER, '계좌번호를 설정해주세요'),
    accountHolder: getProperty_(APP.PROPERTIES.ACCOUNT_HOLDER, '예금주를 설정해주세요'),
    qrImageUrl: getProperty_(APP.PROPERTIES.QR_IMAGE_URL, '')
  };
  putCachedJson_(CACHE_KEYS.SETTINGS, settings, 300);
  return settings;
}

function getWebAppUrl_() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (error) {
    return '';
  }
}

function startPerf_(name, meta) {
  var now = new Date().getTime();
  return {
    name: name,
    start: now,
    last: now,
    meta: meta || {}
  };
}

function perfStep_(perf, step, extra) {
  if (!PERF_LOG_ENABLED || !perf) {
    return;
  }
  var now = new Date().getTime();
  perfLog_(perf, 'step', step, now - perf.last, now - perf.start, extra);
  perf.last = now;
}

function perfEnd_(perf, extra) {
  if (!PERF_LOG_ENABLED || !perf) {
    return;
  }
  var now = new Date().getTime();
  perfLog_(perf, 'end', 'total', now - perf.last, now - perf.start, extra);
  perf.last = now;
}

function perfLog_(perf, type, step, ms, totalMs, extra) {
  try {
    var event = {
      kind: 'perf',
      type: type,
      name: perf.name,
      step: step,
      ms: ms,
      totalMs: totalMs
    };
    mergePerfFields_(event, perf.meta);
    mergePerfFields_(event, extra || {});
    console.log('[PERF] ' + JSON.stringify(event));
  } catch (error) {
    // Performance logging must never affect kiosk behavior.
  }
}

function mergePerfFields_(target, source) {
  for (var key in source) {
    if (source[key] === undefined || source[key] === null) {
      continue;
    }
    target[key] = source[key];
  }
}

function getCachedJson_(key) {
  try {
    var value = CacheService.getScriptCache().get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    return null;
  }
}

function putCachedJson_(key, value, ttlSeconds) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(value), ttlSeconds);
  } catch (error) {
    // Cache is a performance hint only.
  }
}

function getPickupCacheKey_() {
  return CACHE_KEYS.PICKUP + ':' + getReadCacheVersion_();
}

function getCustomerPickupCacheKey_(customerKey) {
  return [
    CACHE_KEYS.CUSTOMER_PICKUP,
    getReadCacheVersion_(),
    cacheKeyDigest_(customerKey)
  ].join(':');
}

function getCustomerAccessCacheKey_(ref) {
  return [
    CACHE_KEYS.CUSTOMER_ACCESS,
    getReadCacheVersion_(),
    cacheKeyDigest_(String(ref.orderId || '') + ':' + String(ref.orderToken || ''))
  ].join(':');
}

function getOrderPickupCacheKey_(payload) {
  payload = payload || {};
  var orderId = sanitizeText_(payload.orderId, 40);
  var orderToken = sanitizeText_(payload.orderToken, 120);
  if (!orderId || !orderToken) {
    return '';
  }
  return [
    CACHE_KEYS.CUSTOMER_ACCESS,
    'order',
    getReadCacheVersion_(),
    cacheKeyDigest_(orderId + ':' + orderToken)
  ].join(':');
}

function getPrimaryOrderRef_(refs) {
  if (!Array.isArray(refs)) {
    return null;
  }
  for (var i = 0; i < refs.length && i < 20; i += 1) {
    var orderId = sanitizeText_(refs[i].orderId, 40);
    var orderToken = sanitizeText_(refs[i].orderToken, 120);
    if (orderId && orderToken) {
      return {
        orderId: orderId,
        orderToken: orderToken
      };
    }
  }
  return null;
}

function getAdminSnapshotCacheKey_(session) {
  return getScopedReadCacheKey_(CACHE_KEYS.ADMIN_SNAPSHOT, session);
}

function getAdminOrdersCacheKey_(session) {
  return getScopedReadCacheKey_(CACHE_KEYS.ADMIN_ORDERS, session);
}

function getScopedReadCacheKey_(prefix, session) {
  var scope = session && session.role === 'master'
    ? 'master'
    : normalizeTeamId_((session && session.teamId) || (session && session.teamName) || 'team');
  return [
    prefix,
    getReadCacheVersion_(),
    String((session && session.role) || 'unknown'),
    scope
  ].join(':');
}

function cacheKeyDigest_(value) {
  value = String(value || '');
  try {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, value, Utilities.Charset.UTF_8);
    var hex = [];
    for (var i = 0; i < bytes.length; i += 1) {
      var byte = (bytes[i] + 256) % 256;
      hex.push(('0' + byte.toString(16)).slice(-2));
    }
    return hex.join('');
  } catch (error) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  }
}

function getReadCacheVersion_() {
  try {
    var cached = CacheService.getScriptCache().get(READ_CACHE_VERSION_PROPERTY);
    if (cached) {
      return cached;
    }
    var stored = PropertiesService.getScriptProperties().getProperty(READ_CACHE_VERSION_PROPERTY) || '0';
    CacheService.getScriptCache().put(READ_CACHE_VERSION_PROPERTY, stored, 21600);
    return stored;
  } catch (error) {
    return '0';
  }
}

function clearMenusCache_() {
  try {
    CacheService.getScriptCache().removeAll([
      CACHE_KEYS.MENUS,
      CACHE_KEYS.TEAMS
    ]);
  } catch (error) {
    // Cache is a performance hint only.
  }
}

function clearOrderReadCaches_() {
  try {
    var version = String(new Date().getTime());
    CacheService.getScriptCache().put(READ_CACHE_VERSION_PROPERTY, version, 21600);
    PropertiesService.getScriptProperties().setProperty(READ_CACHE_VERSION_PROPERTY, version);
  } catch (error) {
    // Cache is a performance hint only.
  }
}

function clearAppCache_() {
  try {
    CacheService.getScriptCache().removeAll([
      CACHE_KEYS.SCHEMA_READY,
      CACHE_KEYS.MENUS,
      CACHE_KEYS.TEAMS,
      CACHE_KEYS.SETTINGS,
      CACHE_KEYS.PICKUP,
      READ_CACHE_VERSION_PROPERTY
    ]);
  } catch (error) {
    // Cache is a performance hint only.
  }
}

function getProperty_(key, fallback) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  return value || fallback;
}

function createOrderToken_() {
  return Utilities.getUuid();
}

function sanitizeText_(value, maxLength) {
  var text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) {
    return '';
  }
  if (/^[=+\-@]/.test(text)) {
    text = "'" + text;
  }
  if (maxLength && text.length > maxLength) {
    text = text.substring(0, maxLength);
  }
  return text;
}

function normalizeTeamId_(value) {
  var text = String(value || 'team-1').trim().toLowerCase();
  text = text.replace(/\s+/g, '-');
  text = text.replace(/[^a-z0-9가-힣_-]/g, '');
  return text || 'team-1';
}

function normalizeCustomerKey_(pickupName, phone) {
  var name = String(pickupName || '').trim().replace(/\s+/g, '').toLowerCase();
  var phoneDigits = String(phone || '').replace(/\D/g, '');
  return name && phoneDigits ? name + ':' + phoneDigits : '';
}

function toPropertySuffix_(value) {
  var text = String(value || '').trim().toUpperCase();
  text = text.replace(/\s+/g, '_');
  text = text.replace(/-/g, '_');
  text = text.replace(/[^A-Z0-9가-힣_]/g, '');
  return text || 'TEAM';
}

function parseAvailability_(value) {
  if (value === true) {
    return true;
  }
  var text = String(value || '').trim().toUpperCase();
  return text === 'TRUE' || text === 'Y' || text === 'YES' || text === '1' || text === '판매';
}

function parseInteger_(value, fallback) {
  var n = parseInt(String(value).replace(/,/g, '').trim(), 10);
  return isNaN(n) ? fallback : n;
}

function parseJsonArray_(value) {
  if (!value) {
    return [];
  }
  try {
    var parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function toIso_(value) {
  if (!value) {
    return '';
  }
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  }
  return String(value);
}

function formatWon_(amount) {
  return String(parseInteger_(amount, 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원';
}

function parsePostBody_(e) {
  var body = {};
  var params = e.parameter || {};
  for (var key in params) {
    body[key] = params[key];
  }

  if (!e.postData || !e.postData.contents) {
    return body;
  }

  var contents = e.postData.contents;
  try {
    var parsed = JSON.parse(contents);
    for (var jsonKey in parsed) {
      body[jsonKey] = parsed[jsonKey];
    }
    return body;
  } catch (error) {
    var parts = contents.split('&');
    for (var i = 0; i < parts.length; i += 1) {
      var pair = parts[i].split('=');
      if (pair.length >= 2) {
        body[decodeURIComponent(pair[0])] = decodeURIComponent(pair.slice(1).join('='));
      }
    }
    return body;
  }
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeJson_(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function publicError_(error) {
  return error && error.message ? error.message : String(error);
}
