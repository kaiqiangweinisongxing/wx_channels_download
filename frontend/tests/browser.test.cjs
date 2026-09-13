const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let module_sequence = 0;

async function load_browser_model(request) {
  globalThis.__browser_request = request;
  const source = readFileSync(
    path.join(__dirname, "../src/pages/browser.model.js"),
    "utf8",
  ).replace(
    /^import \{ request \} from "@\/biz\/request\.js";$/m,
    "const request = globalThis.__browser_request;",
  );
  module_sequence += 1;
  const encoded_source = Buffer.from(source).toString("base64");
  return import(`data:text/javascript;base64,${encoded_source}#${module_sequence}`);
}

function install_browser_runtime() {
  const make_ref = (initial_value) => {
    let value = initial_value;
    return {
      get value() {
        return value;
      },
      as(next_value) {
        value = next_value;
      },
    };
  };

  class Core {
    constructor(options = {}) {
      this.options = options;
      this.value = options.defaultValue || "";
      this.disabled = Boolean(options.disabled);
      this.loading = Boolean(options.loading);
    }

    setValue(value, options = {}) {
      this.value = value;
      if (!options.silence && this.options.onChange) {
        this.options.onChange(value);
      }
    }

    setLoading(value) {
      this.loading = Boolean(value);
    }

    enable() {
      this.disabled = false;
    }

    disable() {
      this.disabled = true;
    }

    destroy() {}
  }

  class RequestCore {
    constructor(handler) {
      this.handler = handler;
    }

    run(params) {
      return this.handler(params);
    }

    destroy() {}
  }

  globalThis.ref = make_ref;
  globalThis.window = { DLUtils: { toast() {} } };
  globalThis.Timeless = {
    kit: { RequestCore },
    vm: { ButtonCore: Core, InputCore: Core },
  };

  return () => {
    delete globalThis.__browser_request;
    delete globalThis.ref;
    delete globalThis.Timeless;
    delete globalThis.window;
  };
}

test("browser model validates navigation URLs and normalizes inspector data", async () => {
  const cleanup = install_browser_runtime();
  try {
    const model = await load_browser_model({ post() {} });
    assert.equal(model.valid_navigation_url("https://example.com"), true);
    assert.equal(model.valid_navigation_url("http://localhost:3000/path"), true);
    assert.equal(model.valid_navigation_url("file:///tmp/private"), false);

    const result = model.normalize_navigation_result({
      status_code: "200",
      rendered_html: null,
      network: [{ status: "204", body_size: -1 }],
      console_messages: [{ level: "WARN", text: 42 }],
    });
    assert.equal(result.status_code, 200);
    assert.equal(result.rendered_html, "");
    assert.equal(result.network[0].body_size, 0);
    assert.equal(result.console_messages[0].level, "warn");
    assert.equal(result.console_messages[0].text, "42");
  } finally {
    cleanup();
  }
});

test("browser model submits URL and exposes Minib result", async () => {
  const cleanup = install_browser_runtime();
  const calls = [];
  const copied_values = [];
  try {
    const model = await load_browser_model({
      async post(url, body) {
        calls.push({ url, body });
        return {
          error: null,
          data: {
            url: "https://example.com/final",
            status_code: 200,
            rendered_html: "<html>ready</html>",
            network: [{ method: "GET", url: body.url, status: 200 }],
            console_messages: [{ level: "log", text: "ready" }],
          },
        };
      },
    });
    const vm$ = model.BrowserPageViewModel({
      client: {},
      app: {
        copy(value) {
          copied_values.push(value);
        },
      },
    });
    vm$.methods.set_url("https://example.com/start");
    assert.equal(vm$.ui.btn_navigate$.disabled, false);

    await vm$.methods.navigate();

    assert.deepEqual(calls, [
      {
        url: "/api/minib/navigate",
        body: { url: "https://example.com/start" },
      },
    ]);
    assert.equal(vm$.state.loading.value, false);
    assert.equal(vm$.state.error.value, "");
    assert.equal(vm$.state.result.value.url, "https://example.com/final");
    assert.equal(vm$.state.result.value.network.length, 1);
    assert.equal(await vm$.methods.copy_html(), true);
    assert.equal(await vm$.methods.copy_har(), true);
    assert.equal(copied_values[0], "<html>ready</html>");
    const copied_har = JSON.parse(copied_values[1]);
    assert.equal(copied_har.log.version, "1.2");
    assert.equal(copied_har.log.entries[0].request.headers.length, 0);
    assert.equal(copied_har.log.entries[0].response.content.text, undefined);
    vm$.methods.destroy();
  } finally {
    cleanup();
  }
});

test("browser page is registered and uses only DMUI color tokens", () => {
  const store = readFileSync(path.join(__dirname, "../src/store.js"), "utf8");
  const page = readFileSync(
    path.join(__dirname, "../src/pages/browser.js"),
    "utf8",
  );
  const shell = readFileSync(
    path.join(__dirname, "../src/pages/shell.model.js"),
    "utf8",
  );
  const css = readFileSync(
    path.join(__dirname, "../src/pages/browser.css"),
    "utf8",
  );
  assert.match(store, /pathname: "\/browser"/);
  assert.match(shell, /name: "root\.shell\.browser"/);
  assert.match(page, /n: "browser-copy-html-button"/);
  assert.match(page, /n: "browser-copy-har-button"/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
});
