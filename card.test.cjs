const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const path = require("node:path");

const registry = new Map();
const context = vm.createContext({
  HTMLElement: class {
    attachShadow() { this.shadowRoot = { querySelector: () => null }; }
  },
  customElements: { get: name => registry.get(name), define: (name, value) => registry.set(name, value) },
  window: {},
  localStorage: { getItem: () => null, setItem: () => {} },
  console: { info() {} },
  setTimeout, clearTimeout
});
const source = fs.readFileSync(path.join(__dirname, "./fire-stick-easy-buttons.js"), "utf8");
vm.runInContext(source + "\nglobalThis.parseAppsForTest = parseApps;", context);
const Card = registry.get("fire-stick-easy-buttons");

function makeCard(entity = "media_player.test_fire_stick") {
  const card = new Card();
  card.render = () => {};
  card.setConfig({ entity });
  return card;
}

test("app discovery deduplicates, excludes system activities and sorts names", () => {
  const result = context.parseAppsForTest([
    "com.amazon.firetv.youtube/.MainActivity",
    "com.netflix.ninja/.Activity",
    "com.netflix.ninja/.OtherActivity",
    "com.amazon.whasettings/.MainActivity",
    "package:com.not.a.launcher"
  ].join("\n"));
  assert.deepEqual(Array.from(result, app => app.name), ["Netflix", "YouTube"]);
});

test("configuration rejects shell metacharacters before issuing launch commands", () => {
  const card = makeCard();
  assert.throws(() => card.setConfig({ entity: "media_player.test", apps: [{ package: "com.test; reboot" }] }));
  assert.throws(() => card.setConfig({ entity: "media_player.test", apps: [{ package: "com.test", component: "com.test/.Main;reboot" }] }));
});

test("launcher uses the discovered component and configured entity", async () => {
  const card = makeCard();
  const calls = [];
  card._hass = { callWS: async request => { calls.push(request); return {}; } };
  await card.run("input keyevent 3", "Home sent.");
  assert.equal(calls[0].target.entity_id, "media_player.test_fire_stick");
  assert.equal(calls[0].service_data.command, "input keyevent 3");
  card.launch({ package: "com.netflix.ninja", component: "com.netflix.ninja/.Main", name: "Netflix" });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(calls[1].service_data.command, /-n com.netflix.ninja\/.Main$/);
});

test("discovery runs once per day and manual refresh bypasses the interval", async () => {
  const card = makeCard();
  let calls = 0;
  card._hass = { callWS: async () => {
    calls++;
    return { response: { "media_player.test_fire_stick": { adb_response: "com.netflix.ninja/.Main" } } };
  } };
  await card.refreshApps();
  await card.refreshApps();
  assert.equal(calls, 1);
  await card.refreshApps(true);
  assert.equal(calls, 2);
  assert.equal(card.apps[0].name, "Netflix");
});

test("late discovery from a previous device cannot overwrite a new device", async () => {
  const card = makeCard();
  let resolve;
  card._hass = { callWS: () => new Promise(done => { resolve = done; }) };
  const request = card.refreshApps();
  card.setConfig({ entity: "media_player.other_fire_stick", discover_apps: false });
  resolve({ response: { "media_player.test_fire_stick": { adb_response: "com.netflix.ninja/.Main" } } });
  await request;
  assert.equal(card.apps.length, 0);
});

test("ADB launch errors become visible failure messages", async () => {
  const card = makeCard();
  card._hass = { callWS: async () => ({ response: { "media_player.test_fire_stick": { adb_response: "Error: Activity does not exist" } } }) };
  await card.run("input keyevent 3", "Home sent.");
  assert.match(card.message, /Command failed/);
});

