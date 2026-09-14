const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let module_sequence = 0;

async function load_automation_model(request) {
  globalThis.__automation_request = request;
  const source = readFileSync(
    path.join(__dirname, "../src/pages/automation.model.js"),
    "utf8",
  ).replace(
    /^import \{ request \} from "@\/biz\/request\.js";$/m,
    "const request = globalThis.__automation_request;",
  );
  module_sequence += 1;
  const encoded_source = Buffer.from(source).toString("base64");
  const module_url =
    `data:text/javascript;base64,${encoded_source}#${module_sequence}`;
  return import(module_url);
}

function install_automation_runtime() {
  const make_ref = (initial_value) => {
    const subscribers = [];
    let value = initial_value;
    return {
      get value() {
        return value;
      },
      as(next_value) {
        value = next_value;
        subscribers.slice().forEach((subscriber) => {
          subscriber.onChange(value);
        });
      },
      subscribe(subscriber) {
        subscribers.push(subscriber);
        return () => {
          const index = subscribers.indexOf(subscriber);
          if (index >= 0) subscribers.splice(index, 1);
        };
      },
    };
  };

  class Core {
    constructor(options = {}) {
      this.options = options;
      this.disabled = Boolean(options.disabled);
      this.visible = false;
      this.items = options.options || [];
      this.value =
        options.checked !== undefined
          ? Boolean(options.checked)
          : (options.defaultValue ?? options.value ?? "");
    }

    setValue(value, options = {}) {
      this.value = value;
      if (!options.silence && this.options.onChange) {
        this.options.onChange(value);
      }
    }

    setOptions(items) {
      this.items = items;
    }

    enable() {
      this.disabled = false;
    }

    disable() {
      this.disabled = true;
    }

    show() {
      this.visible = true;
    }

    hide() {
      this.visible = false;
    }

    check() {
      this.setValue(true);
    }

    bind(item) {
      return {
        click: () => this.options.onClick && this.options.onClick(item),
      };
    }

    click(...args) {
      return this.options.onClick && this.options.onClick(...args);
    }
  }

  class RequestCore {
    constructor(handler) {
      this.handler = handler;
    }

    run(params) {
      return this.handler(params);
    }
  }

  class ChannelCore {
    constructor(url, options = {}) {
      this.url = url;
      this.options = options;
      this.message_handlers = [];
      this.state_handlers = [];
      this.destroyed = false;
      globalThis.__automation_channels.push(this);
    }

    onMessage(handler) {
      this.message_handlers.push(handler);
    }

    onStateChange(handler) {
      this.state_handlers.push(handler);
    }

    async connect() {
      this.state_handlers.forEach((handler) =>
        handler({ connected: true, connecting: false }),
      );
      return { error: null };
    }

    emit(message) {
      const processed = this.options.process
        ? this.options.process(message)
        : message;
      this.message_handlers.forEach((handler) => handler(processed));
    }

    destroy() {
      this.destroyed = true;
      this.state_handlers.forEach((handler) =>
        handler({ connected: false, connecting: false }),
      );
    }
  }

  class SingleFieldCore {
    constructor(options = {}) {
      this.label = options.label || "";
      this.name = options.name || "";
      this.help = options.help || "";
      this.input = options.input;
    }

    get value() {
      return this.input.value;
    }
  }

  class ObjectFieldCore {
    constructor(options = {}) {
      this.fields = options.fields || {};
    }

    get value() {
      return Object.fromEntries(
        Object.entries(this.fields).map(([name, field]) => [
          name,
          field.value,
        ]),
      );
    }
  }

  globalThis.ref = make_ref;
  globalThis.refarr = make_ref;
  globalThis.refobj = make_ref;
  globalThis.combine = (dependencies, calculate) => {
    const calculate_value = () => {
      const values = {};
      Object.entries(dependencies).forEach(([key, dependency]) => {
        values[key] = dependency.value;
      });
      return calculate(values);
    };
    const result = make_ref(calculate_value());
    Object.values(dependencies).forEach((dependency) => {
      dependency.subscribe({
        onChange() {
          result.as(calculate_value());
        },
      });
    });
    return result;
  };
  globalThis.__automation_channels = [];
  globalThis.window = { __store: { socket_client$: {} } };
  globalThis.Timeless = {
    kit: { RequestCore, ChannelCore },
    vm: {
      ButtonCore: Core,
      ButtonInListCore: Core,
      CheckboxCore: Core,
      DialogCore: Core,
      InputCore: Core,
      SelectCore: Core,
      SelectItemCore: Core,
      SingleFieldCore,
      ObjectFieldCore,
    },
  };

  return () => {
    delete globalThis.__automation_request;
    delete globalThis.ref;
    delete globalThis.refarr;
    delete globalThis.refobj;
    delete globalThis.combine;
    delete globalThis.Timeless;
    delete globalThis.__automation_channels;
    delete globalThis.window;
  };
}

function flow_record(id, name, nodes) {
  return {
    id,
    name,
    description: "",
    trigger_type: "Manual",
    event_key: "",
    definition: JSON.stringify({
      id,
      name,
      start_node: "start",
      context_schema: [{ key: "url", type: "string", required: true }],
      nodes,
    }),
  };
}

test("automation binds canvas geometry with Timeless style objects", () => {
  const source = [
    "../src/pages/flow.components.js",
    "../src/pages/flow_edit.js",
    "../src/pages/flow_detail.js",
    "../src/pages/automation.js",
  ]
    .map((file) => readFileSync(path.join(__dirname, file), "utf8"))
    .join("\n");
  const stylesheet = readFileSync(
    path.join(__dirname, "../src/pages/automation.css"),
    "utf8",
  );

  assert.doesNotMatch(source, /style:\s*`left:/);
  assert.doesNotMatch(source, /return `width:/);
  assert.doesNotMatch(source, /viewBox:\s*view_box_/);
  assert.doesNotMatch(source, /canvas_element\.style\.transform/);
  assert.match(
    source,
    /when:\s*computed\(\s*vm\$\.state\.add_service_form_schema,[\s\S]*?form_schema\.length > 0/,
  );
  assert.match(source, /left:\s*`\$\{position\.left\}px`/);
  assert.match(
    source,
    /width:\s*`\$\{Math\.max\(layout\.width,\s*size\.width \/ zoom\)\}px`/s,
  );
  assert.match(source, /FlowPrimitive\.Background\(/);
  assert.match(source, /FlowPrimitive\.Minimap\(/);
  assert.match(source, /set_flow_zoom\(flow\$\.viewport\.zoom/);
  assert.match(
    source,
    /transform:\s*\n?\s*`translate\(\$\{viewport\.x\}px, \$\{viewport\.y\}px\)/,
  );
  assert.match(
    stylesheet,
    /\.automation-flow-background\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*background-image:/s,
  );
  assert.match(
    stylesheet,
    /\.automation-flow-canvas\s*\{[^}]*position:\s*absolute;[^}]*min-width:\s*100%;[^}]*min-height:\s*100%;/s,
  );
});

test("automation loads and normalizes the pipeline list", async () => {
  const cleanup = install_automation_runtime();
  const calls = [];
  const flows = [
    flow_record("flow-one", "第一个流程", {
      start: {
        id: "start",
        type: "StartNode",
        name: "开始",
        config: {},
        next_node_ids: ["end"],
      },
      end: {
        id: "end",
        type: "EndNode",
        name: "结束",
        config: {},
        next_node_ids: [],
      },
    }),
  ];
  const request = {
    async post(url, params) {
      calls.push({ method: "POST", url, params });
      if (url === "/api/v1/automation/list_flows") {
        return { error: null, data: { list: flows } };
      }
      if (url === "/api/v1/automation/list_flow_nodes") {
        return { error: null, data: { nodes: [] } };
      }
      if (url === "/api/v1/automation/list_schedules") {
        return { error: null, data: { list: [] } };
      }
      throw new Error(`unexpected POST ${url}`);
    },
  };

  try {
    const { AutomationPageViewModel } = await load_automation_model(request);
    const model = AutomationPageViewModel({ client: {} });
    await model.methods.ready();

    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, "/api/v1/automation/list_flows");
    assert.ok(calls.every((call) => call.method === "POST"));
    assert.equal(model.state.pipelines.value.length, 1);
    assert.equal(model.state.pipelines.value[0].nodes.length, 2);
    assert.deepEqual(model.state.pipelines.value[0].edges, [
      {
        id: "start-end-0",
        from: "start",
        to: "end",
        type: "next",
      },
    ]);
    assert.equal(model.state.view_mode.value, "list");
    assert.equal(model.state.selected_flow_id.value, "");
    assert.equal(model.state.selected_pipeline.value, null);
  } finally {
    cleanup();
  }
});

test("automation derives node positions from parent-child relationships", async () => {
  const cleanup = install_automation_runtime();
  try {
    const { calculate_pipeline_node_positions } =
      await load_automation_model({ post() {} });
    const positions = calculate_pipeline_node_positions([
      {
        id: "start",
        type: "StartNode",
        next_ids: ["middle"],
      },
      {
        id: "middle",
        type: "ManualNode",
        position: { x: 420, y: 180 },
        next_ids: ["end"],
      },
      { id: "end", type: "EndNode", next_ids: [] },
    ]);

    assert.deepEqual(positions, {
      start: { x: 40, y: 40 },
      middle: { x: 420, y: 180 },
      end: { x: 560, y: 40 },
    });
  } finally {
    cleanup();
  }
});

test("automation maps the canvas viewport into the minimap", async () => {
  const cleanup = install_automation_runtime();
  try {
    const { calculate_flow_minimap_geometry } =
      await load_automation_model({ post() {} });
    const geometry = calculate_flow_minimap_geometry(
      { width: 1000, height: 500 },
      { width: 500, height: 250 },
      { x: -250, y: -125, zoom: 1 },
      { width: 200, height: 100, padding: 10 },
    );

    assert.equal(geometry.scale, 0.16);
    assert.equal(geometry.offset_x, 20);
    assert.equal(geometry.offset_y, 10);
    assert.deepEqual(geometry.viewport, {
      left: 60,
      top: 30,
      width: 80,
      height: 40,
    });
  } finally {
    cleanup();
  }
});

test("automation opens a requested pipeline in edit mode", async () => {
  const cleanup = install_automation_runtime();
  const calls = [];
  const flow = flow_record("flow-edit", "待编辑流程", {
    start: {
      id: "start",
      type: "StartNode",
      name: "开始",
      config: {},
      position: { x: 120, y: 80 },
      next_node_ids: ["end"],
    },
    end: {
      id: "end",
      type: "EndNode",
      name: "结束",
      config: {},
      next_node_ids: [],
    },
  });
  const request = {
    async post(url, body) {
      calls.push({ method: "POST", url, body });
      if (url === "/api/v1/automation/list_flows") {
        return { error: null, data: { list: [flow] } };
      }
      if (url === "/api/v1/automation/get_flow") {
        assert.equal(body.id, "flow-edit");
        return { error: null, data: flow };
      }
      if (url === "/api/v1/automation/list_flow_nodes") {
        return { error: null, data: { nodes: [] } };
      }
      if (url === "/api/v1/automation/list_schedules") {
        return { error: null, data: { list: [] } };
      }
      if (url === "/api/v1/automation/update_flow") {
        return { error: null, data: flow };
      }
      throw new Error(`unexpected POST ${url}`);
    },
  };

  try {
    const { AutomationPageViewModel } = await load_automation_model(request);
    const model = AutomationPageViewModel({
      client: {},
      view: { query: { mode: "edit", id: "flow-edit" } },
    });
    await model.methods.ready();

    assert.equal(model.state.view_mode.value, "edit");
    assert.equal(model.state.selected_flow_id.value, "flow-edit");
    assert.equal(model.state.selected_pipeline.value.id, "flow-edit");
    assert.equal(model.state.selected_edit_node_id.value, "start");
    assert.equal(model.state.edit_nodes.value[0].id, "start");
    assert.deepEqual(model.state.edit_nodes.value[0].position, {
      x: 120,
      y: 80,
    });
    assert.deepEqual(
      model.state.edit_nodes.value.find((node) => node.id === "end").position,
      { x: 300, y: 40 },
    );
    assert.ok(
      calls.some((call) => call.url === "/api/v1/automation/get_flow"),
    );

    model.ui.input_edit_node_name$.setValue("新的开始节点");
    model.ui.input_edit_node_config$.setValue('{"source":"manual"}');
    model.ui.btn_apply_node_config$.click();

    assert.equal(model.state.edit_nodes.value[0].name, "新的开始节点");
    assert.deepEqual(model.state.edit_nodes.value[0].config, {
      source: "manual",
    });
    model.methods.moveEditNode("start", { x: 240, y: 160 });
    assert.deepEqual(model.state.edit_nodes.value[0].position, {
      x: 240,
      y: 160,
    });
    model.methods.stageEditNodePosition("start", { x: 260, y: 180 });
    assert.equal(model.state.dirty.value, true);

    await model.ui.btn_save_flow$.click();
    const save_call = calls.find(
      (call) => call.url === "/api/v1/automation/update_flow",
    );
    assert.ok(save_call);
    assert.equal(save_call.method, "POST");
    assert.equal(save_call.body.id, "flow-edit");
    assert.equal("edges" in save_call.body, false);
    assert.equal(save_call.body.nodes[0].name, "新的开始节点");
    assert.deepEqual(save_call.body.nodes[0].config, { source: "manual" });
    assert.deepEqual(save_call.body.nodes[0].position, { x: 260, y: 180 });
    assert.deepEqual(
      save_call.body.nodes.find((node) => node.id === "end").position,
      { x: 300, y: 40 },
    );
    assert.equal(model.state.dirty.value, false);
  } finally {
    cleanup();
  }
});

test("automation applies WebSocket node status and execution logs", async () => {
  const cleanup = install_automation_runtime();
  const flow = flow_record("flow-live", "实时流程", {
    start: {
      id: "start",
      type: "StartNode",
      name: "开始",
      config: {},
      next_node_ids: [],
    },
  });
  const request = {
    async post(url) {
      if (url === "/api/v1/automation/list_flows") {
        return { error: null, data: { list: [flow] } };
      }
      if (url === "/api/v1/automation/get_flow") {
        return { error: null, data: flow };
      }
      if (url === "/api/v1/automation/list_flow_nodes") {
        return { error: null, data: { nodes: [] } };
      }
      if (url === "/api/v1/automation/list_schedules") {
        return { error: null, data: { list: [] } };
      }
      throw new Error(`unexpected POST ${url}`);
    },
  };

  try {
    const { AutomationPageViewModel } = await load_automation_model(request);
    const model = AutomationPageViewModel({
      client: {},
      view: { query: { mode: "edit", id: "flow-live" } },
    });
    await model.methods.ready();
    const channel = globalThis.__automation_channels[0];
    assert.equal(channel.url, "/ws/v1/automation");
    assert.equal(model.state.execution_channel_connected.value, true);

    channel.emit(
      JSON.stringify({
        type: "automation_run_started",
        flow_id: "flow-live",
        run_id: "run-live",
        run_status: "RUNNING",
      }),
    );
    channel.emit({
      type: "automation_node_status",
      flow_id: "flow-live",
      run_id: "run-live",
      node_status: {
        flow_id: "flow-live",
        run_id: "run-live",
        node_id: "start",
        status: "RUNNING",
        attempt: 1,
      },
    });
    channel.emit({
      type: "automation_node_log",
      flow_id: "flow-live",
      run_id: "run-live",
      execution_log: {
        run_id: "run-live",
        node_id: "start",
        attempt: 1,
        outcome: "completed",
        input: { url: "https://example.com" },
        behavior: { config: {} },
        output: { result: true },
      },
    });

    assert.equal(model.state.execution_run_id.value, "run-live");
    assert.equal(model.state.execution_run_status.value, "RUNNING");
    assert.equal(
      model.state.node_execution_states.value.start.status,
      "RUNNING",
    );
    assert.equal(model.state.execution_logs.value.length, 1);
    assert.deepEqual(model.state.execution_logs.value[0].output, {
      result: true,
    });

    channel.emit({
      type: "automation_run_completed",
      flow_id: "flow-live",
      run_id: "run-live",
      run_status: "COMPLETED",
    });
    assert.equal(model.state.execution_run_status.value, "COMPLETED");

    model.methods.destroy();
    assert.equal(channel.destroyed, true);
  } finally {
    cleanup();
  }
});

test("automation creates a pipeline and selects the refreshed record", async () => {
  const cleanup = install_automation_runtime();
  const calls = [];
  const flows = [];
  const request = {
    async post(url, body) {
      calls.push({ method: "POST", url, body });
      if (url === "/api/v1/automation/list_flows") {
        return { error: null, data: { list: flows } };
      }
      if (url === "/api/v1/automation/list_flow_nodes") {
        return { error: null, data: { nodes: [] } };
      }
      if (url === "/api/v1/automation/list_schedules") {
        return { error: null, data: { list: [] } };
      }
      if (url === "/api/v1/automation/create_flow") {
        const created = flow_record("flow-created", body.name, {
          start: {
            id: "start",
            type: "StartNode",
            name: "开始",
            config: {},
            next_node_ids: [],
          },
        });
        flows.unshift(created);
        return { error: null, data: created };
      }
      throw new Error(`unexpected POST ${url}`);
    },
  };

  try {
    const { AutomationPageViewModel } = await load_automation_model(request);
    const model = AutomationPageViewModel({ client: {} });
    await model.methods.ready();
    model.methods.openCreateDialog();
    model.methods.setCreateTriggerType("Manual");
    model.ui.input_create_name$.setValue("新建流程");
    await model.ui.btn_create_submit$.click();

    const create_call = calls.find(
      (call) =>
        call.method === "POST" &&
        call.url === "/api/v1/automation/create_flow",
    );
    assert.equal(create_call.body.name, "新建流程");
    assert.equal(create_call.body.trigger_type, "Manual");
    assert.deepEqual(create_call.body.context_schema, []);
    assert.equal(model.state.pipelines.value.length, 1);
    assert.equal(model.state.selected_flow_id.value, "flow-created");
    assert.equal(model.state.selected_pipeline.value.id, "flow-created");
    assert.equal(model.state.selected_pipeline.value.nodes.length, 1);
    assert.equal(model.ui.btn_create_submit$.disabled, false);
    assert.equal(model.ui.create_dialog$.visible, false);
    assert.match(model.state.notice.value, /Pipeline 创建成功/);
  } finally {
    cleanup();
  }
});

test("automation inserts a node after the node chosen from the flow canvas", async () => {
  const cleanup = install_automation_runtime();
  const flow = flow_record("flow-insert", "插入节点流程", {
    start: {
      id: "start",
      type: "StartNode",
      name: "开始",
      config: {},
      next_node_ids: ["finish"],
    },
    finish: {
      id: "finish",
      type: "EndNode",
      name: "结束",
      config: {},
      next_node_ids: [],
    },
  });
  const request = {
    async post(url, body) {
      if (url === "/api/v1/automation/list_flows") {
        return { error: null, data: { list: [flow] } };
      }
      if (url === "/api/v1/automation/get_flow") {
        assert.equal(body.id, "flow-insert");
        return { error: null, data: flow };
      }
      if (url === "/api/v1/automation/list_flow_nodes") {
        return { error: null, data: { nodes: [] } };
      }
      if (url === "/api/v1/automation/list_schedules") {
        return { error: null, data: { list: [] } };
      }
      throw new Error(`unexpected POST ${url}`);
    },
  };

  try {
    const { AutomationPageViewModel } = await load_automation_model(request);
    const model = AutomationPageViewModel({
      client: {},
      view: { query: { mode: "edit", id: "flow-insert" } },
    });
    await model.methods.ready();

    model.methods.selectEditNode("finish");
    model.methods.openAddDialog("ManualNode", "start");

    assert.equal(model.state.add_from.value, "start");
    assert.equal(model.state.add_type.value, "ManualNode");
    assert.equal(model.state.selected_edit_node_id.value, "start");

    model.ui.input_add_name$.setValue("下载文件");
    await model.ui.btn_add_submit$.click();

    const nodes = model.state.edit_nodes.value;
    const inserted = nodes.find(
      (node) => node.id !== "start" && node.id !== "finish",
    );
    assert.ok(inserted);
    assert.equal(inserted.type, "ManualNode");
    assert.equal(inserted.name, "下载文件");
    assert.deepEqual(
      nodes.find((node) => node.id === "start").next_ids,
      [inserted.id],
    );
    assert.deepEqual(inserted.next_ids, ["finish"]);
    assert.equal(model.state.selected_edit_node_id.value, inserted.id);
    assert.equal(model.state.dirty.value, true);
    assert.equal(model.ui.add_dialog$.visible, false);
  } finally {
    cleanup();
  }
});

test("automation derives a service node form from the tool input schema", async () => {
  const cleanup = install_automation_runtime();
  const flow = flow_record("flow-service", "服务节点流程", {
    start: {
      id: "start",
      type: "StartNode",
      name: "开始",
      config: {},
      next_node_ids: [],
    },
  });
  const request = {
    async post(url) {
      if (url === "/api/v1/automation/list_flows") {
        return { error: null, data: { list: [flow] } };
      }
      if (url === "/api/v1/automation/get_flow") {
        return { error: null, data: flow };
      }
      if (url === "/api/v1/automation/list_flow_nodes") {
        return {
          error: null,
          data: {
            nodes: [
              {
                type: "ServiceNode",
                name: "服务调用",
                tools: [
                  {
                    name: "get_wxchannels_account_videos",
                    title: "获取微信视频号账号的视频列表",
                    input_schema: {
                      type: "object",
                      properties: {
                        next_marker: {
                          type: "string",
                          description: "上一页的分页游标",
                        },
                        username: {
                          type: "string",
                          description: "视频号账号 username",
                        },
                      },
                      required: ["username"],
                    },
                  },
                ],
              },
            ],
          },
        };
      }
      if (url === "/api/v1/automation/list_schedules") {
        return { error: null, data: { list: [] } };
      }
      throw new Error(`unexpected POST ${url}`);
    },
  };

  try {
    const { AutomationPageViewModel } = await load_automation_model(request);
    const model = AutomationPageViewModel({
      client: {},
      view: { query: { mode: "edit", id: "flow-service" } },
    });
    await model.methods.ready();

    model.methods.openAddDialog("ServiceNode", "start");
    assert.equal(model.ui.select_add_service_tool$.items.length, 1);
    model.ui.select_add_service_tool$.setValue(
      "get_wxchannels_account_videos",
    );
    assert.equal(
      model.state.add_service_tool.value,
      "get_wxchannels_account_videos",
    );
    assert.equal(model.state.add_service_form_error.value, "");
    const form = model.state.add_service_form.value;
    assert.deepEqual(Object.keys(form.fields), ["username", "next_marker"]);
    assert.equal(
      model.state.add_service_form_schema.value[0].required,
      true,
    );
    assert.deepEqual(JSON.parse(model.state.add_config.value).arguments, {});
    form.fields.username.input.setValue("example@finder");
    form.fields.next_marker.input.setValue("next-page");
    assert.deepEqual(JSON.parse(model.state.add_config.value).arguments, {
      username: "example@finder",
      next_marker: "next-page",
    });

    await model.ui.btn_add_submit$.click();
    const service_node = model.state.edit_nodes.value.find(
      (node) => node.type === "ServiceNode",
    );
    assert.ok(service_node);
    assert.equal(
      service_node.config.tool_name,
      "get_wxchannels_account_videos",
    );
    assert.deepEqual(service_node.config.arguments, {
      username: "example@finder",
      next_marker: "next-page",
    });
    assert.equal(service_node.config.output_key, "service_result");
  } finally {
    cleanup();
  }
});
