const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

const context = {
  console,
  Utilities: {
    getUuid: () => '00000000-0000-4000-8000-000000000000',
    formatDate: (date) => date.toISOString().slice(0, 19)
  },
  Session: {
    getScriptTimeZone: () => 'Asia/Seoul',
    getActiveUser: () => ({ getEmail: () => 'admin@example.com' })
  }
};

vm.createContext(context);
vm.runInContext(code, context);

const scriptProperties = {
  ADMIN_PIN: '0000',
  YEONGJU_ADMIN_PIN: '1111',
  ADMIN_PIN_JEJU: '2222'
};
context.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (key) => scriptProperties[key] || '',
    getProperties: () => Object.assign({}, scriptProperties)
  })
};
context.getTeams_ = () => [
  { teamId: 'yeongju', teamName: '영주팀' },
  { teamId: 'jeju', teamName: '제주팀' }
];

assert.strictEqual(context.formatOrderId_('A', 1), 'A001');
assert.strictEqual(context.formatOrderId_('A', 27), 'A027');
assert.strictEqual(context.formatOrderId_('A', 1000), 'A1000');

assert.strictEqual(context.sanitizeText_('=IMPORTXML("x")', 40), '\'=IMPORTXML("x")');
assert.strictEqual(context.sanitizeText_('  김민준  ', 40), '김민준');
assert.strictEqual(context.sanitizeText_('1234567890', 4), '1234');

assert.strictEqual(context.parseAvailability_(true), true);
assert.strictEqual(context.parseAvailability_('TRUE'), true);
assert.strictEqual(context.parseAvailability_('Y'), true);
assert.strictEqual(context.parseAvailability_('FALSE'), false);
assert.strictEqual(context.parseInteger_('3,000', 0), 3000);
assert.strictEqual(context.normalizeTeamId_('제주팀'), '제주팀');
assert.strictEqual(context.normalizeTeamId_('Team 2'), 'team-2');

assert.strictEqual(context.normalizeStatus_('ready'), 'READY');
assert.strictEqual(context.normalizeStatus_('unknown'), 'PAYMENT_PENDING');
assert.strictEqual(context.canTransition_('PAYMENT_CHECKING', 'PAID'), true);
assert.strictEqual(context.canTransition_('PAYMENT_CHECKING', 'READY'), false);
assert.strictEqual(context.canTransition_('PAID', 'READY'), true);
assert.strictEqual(context.canTransition_('PAID', 'COMPLETE'), false);
assert.strictEqual(context.canTransition_('READY', 'COMPLETE'), true);
assert.strictEqual(context.canTransition_('READY', 'PAID'), false);
assert.strictEqual(context.requireAdmin_('0000').role, 'master');
assert.strictEqual(context.requireAdmin_('1111').teamId, 'yeongju');
assert.strictEqual(context.requireAdmin_('2222').teamId, 'jeju');
assert.strictEqual(context.adminCanAccessTeam_(context.requireAdmin_('0000'), 'jeju'), true);
assert.strictEqual(context.adminCanAccessTeam_(context.requireAdmin_('1111'), 'jeju'), false);
assert.strictEqual(context.sanitizeText_('', 40) || '채명정', '채명정');

const menuMap = {
  'food-001': {
    menuId: 'food-001',
    teamId: 'team-1',
    teamName: '제주팀',
    name: '김밥',
    price: 3000,
    category: '음식',
    isAvailable: true,
    sortOrder: 1
  },
  'drink-001': {
    menuId: 'drink-001',
    teamId: 'team-1',
    teamName: '제주팀',
    name: '아이스티',
    price: 2000,
    category: '음료',
    isAvailable: true,
    sortOrder: 2
  },
  'sold-out': {
    menuId: 'sold-out',
    teamId: 'team-1',
    teamName: '제주팀',
    name: '품절메뉴',
    price: 1000,
    category: '음식',
    isAvailable: false,
    sortOrder: 3
  },
  'team-2-menu': {
    menuId: 'team-2-menu',
    teamId: 'team-2',
    teamName: '영주팀',
    name: '수제청',
    price: 5000,
    category: '물품',
    isAvailable: true,
    sortOrder: 4
  }
};

const order = context.buildOrderItems_([
  { menuId: 'food-001', quantity: 2 },
  { menuId: 'food-001', quantity: 1 },
  { menuId: 'drink-001', quantity: 2 }
], menuMap, 'team-1');

assert.strictEqual(order.items.length, 2);
assert.strictEqual(order.totalAmount, 13000);
assert.strictEqual(order.teamOrders.length, 1);
assert.strictEqual(order.teamOrders[0].teamId, 'team-1');
assert.strictEqual(order.teamOrders[0].teamName, '제주팀');
assert(order.itemsText.includes('김밥 x 3'));
assert(order.itemsText.includes('아이스티 x 2'));

assert.throws(
  () => context.buildOrderItems_([{ menuId: 'sold-out', quantity: 1 }], menuMap),
  /품절/
);
assert.throws(
  () => context.buildOrderItems_([{ menuId: 'missing', quantity: 1 }], menuMap),
  /존재하지 않는 메뉴/
);
assert.throws(
  () => context.buildOrderItems_([{ menuId: 'food-001', quantity: 100 }], menuMap),
  /최대 99개/
);
const mixedOrder = context.buildOrderItems_([
  { menuId: 'food-001', quantity: 1 },
  { menuId: 'team-2-menu', quantity: 1 }
], menuMap);
assert.strictEqual(mixedOrder.items.length, 2);
assert.strictEqual(mixedOrder.teamOrders.length, 2);
assert.strictEqual(mixedOrder.totalAmount, 8000);

assert.strictEqual(context.normalizeCustomerKey_(' 채 명정 ', '010-7760-3932'), '채명정:01077603932');
assert.notStrictEqual(context.normalizeCustomerKey_('채명정3', '010-7760-3932'), context.normalizeCustomerKey_('채명정', '010-7760-3932'));

console.log('backend logic tests passed');
