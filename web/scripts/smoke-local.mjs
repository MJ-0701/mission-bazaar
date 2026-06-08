const base = process.env.APP_URL || "http://127.0.0.1:3010";

async function call(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const json = await response.json();
  if (!json.ok) {
    throw new Error(`${path} ${json.error}`);
  }
  return { data: json.data, response };
}

const boot = await call("/api/public/bootstrap");
const morning = boot.data.menus.find((menu) => menu.code === "yeongju-morning-sand");
const main = boot.data.menus.find((menu) => menu.code === "jeju-main-dish");

if (!morning || !main) {
  throw new Error("Required seed menus are missing.");
}

const created = await call("/api/orders", {
  method: "POST",
  body: JSON.stringify({
    pickupName: `스모크${Date.now()}`,
    phone: `010${String(Date.now()).slice(-8)}`,
    items: [
      { menuId: morning.id, quantity: 1 },
      { menuId: main.id, quantity: 1 }
    ]
  })
});

const order = created.data;
await call(`/api/orders/${order.orderNo}/payment-checking`, {
  method: "POST",
  body: JSON.stringify({ token: order.orderToken })
});

const before = await call(`/api/pickup?orderNo=${order.orderNo}&token=${order.orderToken}`);
const login = await call("/api/admin/login", {
  method: "POST",
  body: JSON.stringify({ pin: "0000" })
});
const cookie = login.response.headers.get("set-cookie").split(";")[0];
const dashboard = await call("/api/admin/dashboard", { headers: { cookie } });
const yeongjuSection = dashboard.data.orders.find((section) => section.teamCode === "yeongju");

await call("/api/admin/status", {
  method: "POST",
  headers: { cookie },
  body: JSON.stringify({ sectionId: yeongjuSection.id, status: "PAID" })
});

await call("/api/admin/status", {
  method: "POST",
  headers: { cookie },
  body: JSON.stringify({ sectionId: yeongjuSection.id, status: "READY" })
});

const after = await call(`/api/pickup?orderNo=${order.orderNo}&token=${order.orderToken}`);

console.log(
  JSON.stringify(
    {
      orderNo: order.orderNo,
      before: before.data.orders.map((section) => [section.teamCode, section.status]),
      after: after.data.orders.map((section) => [section.teamCode, section.status])
    },
    null,
    2
  )
);
