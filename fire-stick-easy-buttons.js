const VERSION = "1.0.0";
const DAY = 24 * 60 * 60 * 1000;
const PACKAGE = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+$/;
const COMPONENT = /^[a-zA-Z][a-zA-Z0-9_.]*\/[a-zA-Z0-9_.$]+$/;
const DISCOVER = "cmd package query-activities --brief -a android.intent.action.MAIN -c android.intent.category.LEANBACK_LAUNCHER | grep /";
const APP_NAMES = {
  "com.amazon.firetv.youtube": ["YouTube", "mdi:youtube"],
  "com.amazon.firetv.youtube.tv": ["YouTube TV", "mdi:youtube-tv"],
  "com.netflix.ninja": ["Netflix", "mdi:netflix"],
  "com.hulu.plus": ["Hulu", "mdi:television-play"],
  "com.disney.disneyplus": ["Disney+", "mdi:castle"],
  "com.apple.atve.amazon.appletv": ["Apple TV", "mdi:apple"],
  "com.peacock.peacockfiretv": ["Peacock", "mdi:television-play"],
  "com.cbs.ott": ["Paramount+", "mdi:mountain"],
  "com.hbo.hbonow": ["HBO Max", "mdi:television-play"],
  "com.amazon.bueller.music": ["Amazon Music", "mdi:music"],
  "com.amazon.firebat": ["Silk browser", "mdi:web"],
  "tv.pluto.android": ["Pluto TV", "mdi:television-play"],
  "com.fubo.firetv.screen": ["Fubo", "mdi:soccer"],
  "com.fng.foxnation": ["FOX Nation", "mdi:television-play"],
  "com.flosports.signal.tv": ["FloSports", "mdi:basketball"],
  "org.byutv.android": ["BYUtv", "mdi:television-play"],
  "com.rumble.firetv": ["Rumble", "mdi:play-circle"],
  "com.esaba.downloader": ["Downloader", "mdi:download"]
};
const HIDDEN_APPS = new Set([
  "com.amazon.audiohome", "com.amazon.firetv.troubleshooting",
  "com.amazon.shoptv.firetv.client", "com.amazon.smarthomemapviewapp",
  "com.amazon.whasettings"
]);

function parseApps(text) {
  const apps = new Map();
  for (const match of text.matchAll(/([a-zA-Z][a-zA-Z0-9_.]+)\/([a-zA-Z0-9_.$]+)/g)) {
    const packageId = match[1];
    if (HIDDEN_APPS.has(packageId) || !PACKAGE.test(packageId)) continue;
    const [name, icon] = APP_NAMES[packageId] || [packageId, "mdi:apps"];
    apps.set(packageId, { package: packageId, component: match[0], name, icon });
  }
  return [...apps.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

class FireStickEasyButtons extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.apps = [];
    this.message = "";
    this.generation = 0;
  }

  static getStubConfig(hass) {
    const entity = Object.keys(hass.states).find(id =>
      id.startsWith("media_player.") && /fire.?tv|fire.?stick/i.test(
        id + " " + (hass.states[id].attributes.friendly_name || "")
      ));
    return { entity: entity || "", title: "Fire Stick Easy Buttons", discover_apps: true };
  }

  static getConfigElement() {
    return document.createElement("fire-stick-easy-buttons-editor");
  }

  setConfig(config) {
    if (!config.entity || !/^media_player\.[a-zA-Z0-9_]+$/.test(config.entity)) {
      throw new Error("Choose the Fire Stick media player from the Android Debug Bridge integration.");
    }
    const configuredApps = config.apps || [];
    if (!Array.isArray(configuredApps) || configuredApps.some(app =>
      !app || !PACKAGE.test(app.package || "") ||
      (app.component && !COMPONENT.test(app.component))
    )) throw new Error("Each app needs a valid package ID and, optionally, a launcher component.");
    clearTimeout(this.timer);
    this.generation += 1;
    this.config = { title: "Fire Stick Easy Buttons", discover_apps: true, ...config };
    this.apps = [];
    this.lastCheck = 0;
    this.started = false;
    this.loading = false;
    this.busy = false;
    this.message = "";
    try {
      const cache = JSON.parse(localStorage.getItem(this.cacheKey()) || "null");
      if (cache && Number.isFinite(cache.checked) && Array.isArray(cache.apps)) {
        this.apps = cache.apps.filter(app => PACKAGE.test(app.package || "") && COMPONENT.test(app.component || ""));
        this.lastCheck = cache.checked;
      }
    } catch {}
    this.render();
    this.start();
  }

  set hass(hass) {
    this._hass = hass;
    this.updateState();
    this.start();
  }

  connectedCallback() { this.start(); }
  disconnectedCallback() { clearTimeout(this.timer); this.started = false; }
  getCardSize() { return 12; }
  getGridOptions() { return { columns: 12, min_columns: 6, rows: "auto" }; }
  cacheKey() { return "fire-stick-easy-buttons-v1:" + this.config.entity; }

  start() {
    if (!this.isConnected || !this.config || !this._hass || this.started) return;
    this.started = true;
    if (this.config.discover_apps) this.refreshApps();
  }

  schedule() {
    clearTimeout(this.timer);
    if (this.isConnected && this.config.discover_apps) {
      this.timer = setTimeout(() => this.refreshApps(), Math.max(1000, DAY - (Date.now() - this.lastCheck)));
    }
  }

  async command(command) {
    const result = await this._hass.callWS({
      type: "call_service", domain: "androidtv", service: "adb_command",
      target: { entity_id: this.config.entity },
      service_data: { command }, return_response: true
    });
    const response = result.response || result;
    return response[this.config.entity]?.adb_response || "";
  }

  async refreshApps(force = false) {
    if (this.loading || !this._hass) return;
    if (!force && this.lastCheck && Date.now() - this.lastCheck < DAY) {
      this.schedule();
      return;
    }
    const generation = this.generation;
    this.loading = true;
    this.lastCheck = Date.now();
    this.message = "Checking installed apps…";
    this.render();
    try {
      const response = await this.command(DISCOVER);
      if (generation !== this.generation) return;
      const apps = parseApps(response);
      if (!apps.length) throw new Error("No app list returned");
      this.apps = apps;
      this.message = "";
      try { localStorage.setItem(this.cacheKey(), JSON.stringify({ checked: this.lastCheck, apps })); } catch {}
    } catch {
      if (generation === this.generation) this.message = "Could not check apps. Wake the Fire Stick, then tap Refresh apps.";
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        this.render();
        this.schedule();
      }
    }
  }

  async run(command, message) {
    if (this.busy || !this._hass) return;
    const generation = this.generation;
    this.busy = true;
    this.message = "Sending…";
    this.render();
    try {
      const response = await this.command(command);
      if (/Error:|Exception|unable to resolve|does not exist|Permission Denial/i.test(response)) {
        throw new Error("Command rejected");
      }
      if (generation === this.generation) this.message = message;
    } catch {
      if (generation === this.generation) this.message = "Command failed. Check the Fire Stick connection in Android Debug Bridge.";
    } finally {
      if (generation === this.generation) { this.busy = false; this.render(); }
    }
  }

  launch(app) {
    const command = app.component
      ? "am start -a android.intent.action.MAIN -c android.intent.category.LEANBACK_LAUNCHER -n " + app.component
      : "monkey -p " + app.package + " -c android.intent.category.LAUNCHER 1";
    this.run(command, "Open request sent for " + app.name + ".");
  }

  updateState() {
    const status = this.shadowRoot.querySelector(".current");
    if (!status || !this._hass || !this.config) return;
    const state = this._hass.states[this.config.entity];
    const app = state?.attributes.app_id;
    status.textContent = !state ? "Entity not found" :
      ["unavailable", "unknown"].includes(state.state) ? "Fire Stick unavailable" :
      state.state === "off" ? "Fire Stick asleep" :
      app ? "Now using " + (APP_NAMES[app]?.[0] || app) : "Fire Stick " + state.state;
  }

  button(label, icon, action, className = "") {
    const button = document.createElement("button");
    button.className = className;
    button.disabled = this.busy;
    button.setAttribute("aria-label", label);
    const symbol = document.createElement("ha-icon");
    symbol.setAttribute("icon", icon);
    const text = document.createElement("span");
    text.textContent = label;
    button.append(symbol, text);
    button.addEventListener("click", action);
    return button;
  }

  render() {
    if (!this.config) return;
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block}*{box-sizing:border-box}
        ha-card{padding:20px;background:linear-gradient(135deg,#123744,#171d38 65%,#2c204a);color:#f1f7ff;border-radius:22px}
        h2{font:700 23px/1.3 var(--paper-font-body1_-_font-family,Arial,sans-serif);margin:0 0 8px}
        .current{color:#c2d9ed;margin:0 0 18px;overflow-wrap:anywhere}
        .layout{display:grid;grid-template-columns:minmax(230px,1fr) minmax(200px,1fr);gap:20px}
        .remote{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;align-content:start}
        button{min-width:0;min-height:72px;border:1px solid #536b83;border-radius:15px;background:#20334d;color:#f1f7ff;
          padding:10px 5px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;
          cursor:pointer;touch-action:manipulation;font:600 14px/1.2 Arial,sans-serif}
        button:hover{background:#304b69}button:focus-visible{outline:3px solid #5ee2ff;outline-offset:2px}
        button:active{background:#38607b}button:disabled{opacity:.5;cursor:wait}
        ha-icon{--mdc-icon-size:28px}.confirm{background:#20647b}.apps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .apps button{min-height:76px;font-size:12px;overflow-wrap:anywhere}
        .app-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
        h3{margin:0;font-size:18px}.refresh{font-size:12px;min-height:44px;padding:8px 12px}
        .status{min-height:20px;font-size:13px;color:#c2d9ed;margin:16px 0 0}
        .hint{font-size:13px;color:#c2d9ed;margin:8px 0 0}
        @media(max-width:550px){.layout{grid-template-columns:1fr}.apps{grid-template-columns:repeat(4,minmax(0,1fr))}}
        @media(prefers-reduced-motion:no-preference){button{transition:background .15s}}
      </style>
      <ha-card><h2></h2><p class="current"></p><div class="layout">
        <div class="remote" aria-label="Fire Stick remote"></div>
        <section><div class="app-heading"><h3>Apps</h3></div><div class="apps"></div>
        <p class="hint"></p></section></div><p class="status" role="status" aria-live="polite"></p></ha-card>`;
    this.shadowRoot.querySelector("h2").textContent = this.config.title;
    this.shadowRoot.querySelector(".status").textContent = this.message;
    this.updateState();
    const remote = this.shadowRoot.querySelector(".remote");
    const keys = [
      ["Back", "mdi:arrow-u-left-top", 4], ["Up", "mdi:arrow-up-bold", 19], ["Home", "mdi:home", 3],
      ["Left", "mdi:arrow-left-bold", 21], ["OK", "mdi:check-circle", 23], ["Right", "mdi:arrow-right-bold", 22],
      ["Rewind", "mdi:rewind", 89], ["Down", "mdi:arrow-down-bold", 20], ["Forward", "mdi:fast-forward", 90],
      ["Menu", "mdi:menu", 82], ["Play / pause", "mdi:play-pause", 85], ["Wake", "mdi:power", 224]
    ];
    for (const [label, icon, code] of keys) {
      remote.append(this.button(label, icon, () => this.run("input keyevent " + code, label + " sent."), label === "OK" ? "confirm" : ""));
    }
    const merged = new Map(this.apps.map(app => [app.package, app]));
    for (const app of this.config.apps || []) {
      merged.set(app.package, { ...merged.get(app.package), ...app });
    }
    const apps = [...merged.values()].sort((a, b) =>
      (a.name || a.package).localeCompare(b.name || b.package, undefined, { sensitivity: "base" }));
    for (const app of apps) {
      app.name = app.name || APP_NAMES[app.package]?.[0] || app.package;
      this.shadowRoot.querySelector(".apps").append(
        this.button(app.name, app.icon || APP_NAMES[app.package]?.[1] || "mdi:apps", () => this.launch(app))
      );
    }
    if (this.config.discover_apps) {
      const refresh = this.button(this.loading ? "Checking…" : "Refresh apps", "mdi:refresh", () => this.refreshApps(true), "refresh");
      refresh.disabled = this.loading || this.busy;
      this.shadowRoot.querySelector(".app-heading").append(refresh);
    }
    this.shadowRoot.querySelector(".hint").textContent = this.config.discover_apps
      ? "App list updates once a day. Refresh apps checks now."
      : apps.length ? "" : "Add app package IDs in the card configuration.";
  }
}

class FireStickEasyButtonsEditor extends HTMLElement {
  setConfig(config) { this.config = config; this.render(); }
  set hass(hass) { this._hass = hass; if (!this.shadowRoot?.hasChildNodes()) this.render(); }
  render() {
    if (!this.config || !this._hass) return;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>
      label{display:block;margin:14px 0;font:inherit}input,select{display:block;width:100%;padding:12px;margin-top:6px;font:inherit}
      input[type=checkbox]{display:inline;width:auto}p{line-height:1.5}
    </style><p>Select your Fire Stick from the Android Debug Bridge integration.</p>
      <label>Title<input class="title"></label><label>Fire Stick media player<select></select></label>
      <label><input type="checkbox"> Discover installed apps once a day</label>
      <p>Custom app package IDs can be added using the YAML editor.</p>`;
    const title = this.shadowRoot.querySelector(".title");
    title.value = this.config.title || "Fire Stick Easy Buttons";
    const select = this.shadowRoot.querySelector("select");
    const empty = document.createElement("option");
    empty.value = ""; empty.textContent = "Choose a media player"; select.append(empty);
    for (const [entity, state] of Object.entries(this._hass.states).filter(([id]) => id.startsWith("media_player.")).sort()) {
      const option = document.createElement("option");
      option.value = entity; option.textContent = (state.attributes.friendly_name || entity) + " (" + entity + ")";
      select.append(option);
    }
    select.value = this.config.entity || "";
    const checkbox = this.shadowRoot.querySelector('[type="checkbox"]');
    checkbox.checked = this.config.discover_apps !== false;
    const update = () => {
      this.config = { ...this.config, title: title.value, entity: select.value, discover_apps: checkbox.checked };
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this.config }, bubbles: true, composed: true }));
    };
    title.addEventListener("change", update);
    select.addEventListener("change", update);
    checkbox.addEventListener("change", update);
  }
}

if (!customElements.get("fire-stick-easy-buttons")) customElements.define("fire-stick-easy-buttons", FireStickEasyButtons);
if (!customElements.get("fire-stick-easy-buttons-editor")) customElements.define("fire-stick-easy-buttons-editor", FireStickEasyButtonsEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === "fire-stick-easy-buttons")) {
  window.customCards.push({
    type: "fire-stick-easy-buttons", name: "Fire Stick Easy Buttons",
    description: "Large Fire TV remote buttons and an A–Z app launcher.", preview: true
  });
}
console.info("Fire Stick Easy Buttons " + VERSION);
