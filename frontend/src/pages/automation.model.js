import { request } from "@/biz/request.js";

function parse_initial_data(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("初始数据必须是 JSON 对象");
  }
  return parsed;
}

function schedule_metadata(schedule) {
  const metadata = { type: "Cron", start_node: "", event_key: "" };
  if (!schedule) return metadata;
  try {
    const data = parse_initial_data(schedule.initial_data);
    const raw = data.__automation;
    if (raw && typeof raw === "object") {
      if (raw.type) metadata.type = String(raw.type);
      if (raw.start_node) metadata.start_node = String(raw.start_node);
      if (raw.event_key) metadata.event_key = String(raw.event_key);
    }
  } catch (err) {
    void err;
  }
  if (!["Cron", "Event", "Manual"].includes(metadata.type)) {
    metadata.type = "Cron";
  }
  return metadata;
}

function trigger_label(type) {
  if (type === "Event") return "事件触发";
  if (type === "Manual") return "手动触发";
  return "定时触发";
}

function effective_start_node(flow, schedule) {
  const metadata = schedule_metadata(schedule);
  const nodes = flow && flow.nodes;
  if (
    metadata.start_node &&
    (!nodes || nodes.some((node) => node.id === metadata.start_node))
  ) {
    return metadata.start_node;
  }
  return flow ? flow.start_node_id : "";
}

function schema_text(schema) {
  if (!Array.isArray(schema) || schema.length === 0) return "无";
  return schema
    .map((field) => `${field.key}:${field.type || "any"}`)
    .join("、");
}

function format_time(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "-";
  const date = new Date(number < 1000000000000 ? number * 1000 : number);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (input) => String(input).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function flow_label(type) {
  const names = {
    StartNode: "开始",
    EndNode: "结束",
    ExprNode: "表达式",
    GatewayNode: "条件分支",
    APICallNode: "HTTP 请求",
    ManualNode: "人工确认",
    FuncNode: "函数",
    LoopNode: "循环",
    WorkflowNode: "子流程",
  };
  return names[type] || type;
}

function request_result_error(result, fallback) {
  const error = result && result.error;
  if (error instanceof Error) return error;
  if (error && error.message) return new Error(error.message);
  return new Error(String(error || fallback || "请求失败"));
}

function calculate_pipeline_node_positions(nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  const by_id = new Map(list.map((node) => [node.id, node]));
  const depths = new Map();
  const roots = list.filter((node) => node.type === "StartNode");
  if (roots.length === 0 && list.length > 0) roots.push(list[0]);
  const queue = roots.map((node) => ({ id: node.id, depth: 0 }));

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || !by_id.has(current.id)) continue;
    const known_depth = depths.get(current.id);
    if (known_depth !== undefined && known_depth <= current.depth) continue;
    depths.set(current.id, current.depth);
    const node = by_id.get(current.id);
    (node.next_ids || []).forEach((next_id) => {
      if (by_id.has(next_id)) {
        queue.push({ id: next_id, depth: current.depth + 1 });
      }
    });
  }

  const per_depth = new Map();
  list.forEach((node) => {
    const depth = depths.has(node.id) ? depths.get(node.id) : 0;
    const layer = per_depth.get(depth) || [];
    layer.push(node.id);
    per_depth.set(depth, layer);
  });

  const positions = {};
  per_depth.forEach((ids, depth) => {
    ids.forEach((node_id, index) => {
      positions[node_id] = {
        x: 40 + depth * 260,
        y: 40 + index * 130,
      };
    });
  });
  list.forEach((node) => {
    const position = node.position;
    const x = position && Number(position.x);
    const y = position && Number(position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    positions[node.id] = { x: Math.max(16, x), y: Math.max(16, y) };
  });
  return positions;
}

function calculate_flow_minimap_geometry(
  layout,
  viewport_size,
  viewport,
  minimap_size = {},
) {
  const minimap_width = Math.max(1, Number(minimap_size.width) || 176);
  const minimap_height = Math.max(1, Number(minimap_size.height) || 112);
  const padding = Math.max(0, Number(minimap_size.padding) || 8);
  const zoom = Math.max(0.01, Number(viewport && viewport.zoom) || 1);
  const viewport_width = Math.max(
    1,
    Number(viewport_size && viewport_size.width) || 1,
  );
  const viewport_height = Math.max(
    1,
    Number(viewport_size && viewport_size.height) || 1,
  );
  const world_width = Math.max(
    1,
    Number(layout && layout.width) || 1,
    viewport_width / zoom,
  );
  const world_height = Math.max(
    1,
    Number(layout && layout.height) || 1,
    viewport_height / zoom,
  );
  const content_width = Math.max(1, minimap_width - padding * 2);
  const content_height = Math.max(1, minimap_height - padding * 2);
  const scale = Math.min(
    content_width / world_width,
    content_height / world_height,
    1,
  );
  const offset_x = (minimap_width - world_width * scale) / 2;
  const offset_y = (minimap_height - world_height * scale) / 2;
  const viewport_x = Number(viewport && viewport.x) || 0;
  const viewport_y = Number(viewport && viewport.y) || 0;
  const visible_left = Math.max(0, -viewport_x / zoom);
  const visible_top = Math.max(0, -viewport_y / zoom);
  const visible_right = Math.min(
    world_width,
    (-viewport_x + viewport_width) / zoom,
  );
  const visible_bottom = Math.min(
    world_height,
    (-viewport_y + viewport_height) / zoom,
  );

  return {
    width: minimap_width,
    height: minimap_height,
    scale,
    offset_x,
    offset_y,
    world_width,
    world_height,
    viewport: {
      left: offset_x + visible_left * scale,
      top: offset_y + visible_top * scale,
      width: Math.max(0, visible_right - visible_left) * scale,
      height: Math.max(0, visible_bottom - visible_top) * scale,
    },
  };
}

function normalize_pipeline(value) {
  const pipeline = value && typeof value === "object" ? value : {};
  let definition = {};
  try {
    definition =
      typeof pipeline.definition === "string"
        ? JSON.parse(pipeline.definition)
        : pipeline.definition || {};
  } catch (err) {
    void err;
  }

  const raw_nodes = definition.nodes || {};
  const node_entries = Array.isArray(raw_nodes)
    ? raw_nodes.map((node, index) => [
        node && node.id ? node.id : String(index),
        node,
      ])
    : Object.entries(raw_nodes);
  const nodes = node_entries.map(([node_id, raw_node]) => {
    const node = raw_node && typeof raw_node === "object" ? raw_node : {};
    const next_ids = [];
    const append_next_id = (target_id) => {
      const normalized = String(target_id || "").trim();
      if (normalized && !next_ids.includes(normalized)) next_ids.push(normalized);
    };
    (node.next_node_ids || node.next_ids || []).forEach(append_next_id);
    (node.next_nodes || []).forEach((target) => {
      append_next_id(target && (target.target_id || target.targetId));
    });
    if (node.type === "GatewayNode") {
      const rules = node.config && node.config.rules;
      (Array.isArray(rules) ? rules : []).forEach((rule) => {
        append_next_id(rule && (rule.target_id || rule.target));
      });
    }
    const raw_position = node.position;
    const position_x = raw_position && Number(raw_position.x);
    const position_y = raw_position && Number(raw_position.y);
    const position =
      raw_position &&
      Number.isFinite(position_x) &&
      Number.isFinite(position_y)
        ? { x: position_x, y: position_y }
        : null;
    return {
      id: node.id || node_id,
      type: node.type || "",
      name: node.name || node.id || node_id,
      config: node.config || {},
      position,
      next_ids,
      input_schema: node.input_schema || [],
      output_schema: node.output_schema || [],
    };
  });
  const edges = [];
  nodes.forEach((node) => {
    node.next_ids.forEach((target_id, index) => {
      edges.push({
        id: `${node.id}-${target_id}-${index}`,
        from: node.id,
        to: target_id,
        type: "next",
      });
    });
  });

  return {
    ...pipeline,
    id: pipeline.id || definition.id || "",
    name: pipeline.name || definition.name || "",
    start_node_id:
      definition.start_node ||
      definition.start_node_id ||
      pipeline.start_node_id ||
      "",
    context_schema: definition.context_schema || pipeline.context_schema || [],
    nodes,
    edges,
  };
}

function automation_view_query(props) {
  const query = (props && props.view && props.view.query) || {};
  const requested_mode = String(query.mode || "list").toLowerCase();
  return {
    mode: ["detail", "edit"].includes(requested_mode)
      ? requested_mode
      : "list",
    flow_id: String(query.id || query.flow_id || "").trim(),
  };
}

function AutomationPageViewModel(props) {
  const view_query = automation_view_query(props);
  const view_mode_ = ref(view_query.mode);
  const tab_ = ref("pipelines");
  const pipelines_ = refarr([]);
  const catalog_ = refarr([]);
  const schedules_ = refarr([]);
  const runs_ = refarr([]);
  const selected_flow_id_ = ref(view_query.flow_id);
  const selected_pipeline_ = refobj(null);
  const selected_schedule_id_ = ref("");
  const loading_ = ref(false);
  const error_ = ref("");
  const notice_ = ref("");
  const dirty_ = ref(false);
  const saving_ = ref(false);

  // editor working copy: [{id,type,name,config,next_ids,input_schema}]
  const edit_nodes_ = refarr([]);
  const edit_start_node_id_ = ref("");
  const selected_edit_node_id_ = ref("");
  const edit_node_config_ = ref("{}");
  const staged_node_positions = new Map();

  // create-pipeline dialog state
  const create_open_ = ref(false);
  const create_trigger_type_ = ref("Cron");
  const create_name_ = ref("");
  const create_description_ = ref("");
  const create_event_key_ = ref("");
  const create_cron_ = ref("@daily");
  const create_enabled_ = ref(true);
  const create_params_ = refarr([]);
  const create_submitting_ = ref(false);

  // add-node dialog state
  const add_open_ = ref(false);
  const add_type_ = ref("");
  const add_name_ = ref("");
  const add_config_ = ref("{}");
  const add_from_ = ref("");
  const add_submitting_ = ref(false);

  // create-schedule dialog state
  const schedule_open_ = ref(false);
  const schedule_trigger_type_ = ref("Cron");
  const schedule_event_key_ = ref("");
  const schedule_name_ = ref("");
  const schedule_cron_ = ref("@daily");
  const schedule_start_node_ = ref("");
  const schedule_flow_id_ = ref("");
  const schedule_submitting_ = ref(false);

  let request_sequence = 0;
  let node_sequence = 0;
  let param_sequence = 0;

  const selected_schedule_ = combine(
    { schedules: schedules_, id: selected_schedule_id_ },
    (state) => state.schedules.find((item) => item.id === state.id) || null,
  );

  const reqs = {
    pipeline: {
      list: new Timeless.kit.RequestCore(
        function fetchPipelineList(params) {
          return request.post("/api/v1/automation/list_flows", params);
        },
        { client: props.client },
      ),
      create: new Timeless.kit.RequestCore(
        function createPipeline(body) {
          return request.post("/api/v1/automation/create_flow", body);
        },
        { client: props.client },
      ),
      update: new Timeless.kit.RequestCore(
        function updatePipeline(body) {
          return request.post("/api/v1/automation/update_flow", body);
        },
        { client: props.client },
      ),
      delete: new Timeless.kit.RequestCore(
        function deletePipeline(body) {
          return request.post("/api/v1/automation/delete_flow", body);
        },
        { client: props.client },
      ),
      detail: new Timeless.kit.RequestCore(
        function fetchPipelineDetail(body) {
          return request.post("/api/v1/automation/get_flow", body);
        },
        { client: props.client },
      ),
      catalog: new Timeless.kit.RequestCore(
        function fetchPipelineNodeCatalog(params) {
          return request.post("/api/v1/automation/list_flow_nodes", params);
        },
        { client: props.client },
      ),
      trigger: new Timeless.kit.RequestCore(
        function triggerPipeline(body) {
          return request.post("/api/v1/automation/trigger_flow", body);
        },
        { client: props.client },
      ),
    },
    schedule: {
      list: new Timeless.kit.RequestCore(
        function fetchScheduleList(params) {
          return request.post(`/api/v1/automation/list_schedules`, params);
        },
        { client: props.client },
      ),
      create: new Timeless.kit.RequestCore(
        function createSchedule(body) {
          return request.post(`/api/v1/automation/create_schedule`, body);
        },
        { client: props.client },
      ),
      detail: new Timeless.kit.RequestCore(
        function fetchScheduleDetail(body) {
          return request.post(`/api/v1/automation/get_schedule`, body);
        },
        { client: props.client },
      ),
      trigger: new Timeless.kit.RequestCore(
        function triggerSchedule(body) {
          return request.post(`/api/v1/automation/trigger_schedule`, body);
        },
        { client: props.client },
      ),
      toggle: new Timeless.kit.RequestCore(
        function toggleSchedule(body) {
          return request.post(`/api/v1/automation/toggle_schedule`, body);
        },
        { client: props.client },
      ),
    },
    running: {
      list: new Timeless.kit.RequestCore(
        function fetchRunList(params) {
          return request.post(`/api/v1/automation/list_runs`, params);
        },
        { client: props.client },
      ),
    },
  };

  const ui = {
    create_dialog$: new Timeless.vm.DialogCore({
      closeable: true,
      footer: false,
    }),
    add_dialog$: new Timeless.vm.DialogCore({
      closeable: true,
      footer: false,
    }),
    schedule_dialog$: new Timeless.vm.DialogCore({
      closeable: true,
      footer: false,
    }),
    delete_dialog$: new Timeless.vm.DialogCore({
      onOk() {
        return delete_flow();
      },
    }),
    select_add_type$: new Timeless.vm.SelectCore({
      placeholder: "选择节点类型",
      position: "popper",
      options: [],
      onChange(value) {
        add_type_.as(String(value || ""));
        const default_name = flow_label(add_type_.value);
        const default_config = default_config_json(add_type_.value);
        add_name_.as(default_name);
        add_config_.as(default_config);
        ui.input_add_name$.setValue(default_name, {
          silence: true,
        });
        ui.input_add_config$.setValue(default_config, {
          silence: true,
        });
      },
    }),
    select_add_from$: new Timeless.vm.SelectCore({
      placeholder: "连接自（上一个节点）",
      position: "popper",
      options: [],
    }),
    select_schedule_flow$: new Timeless.vm.SelectCore({
      placeholder: "选择 Pipeline",
      position: "popper",
      options: [],
      onChange(value) {
        schedule_flow_id_.as(String(value || ""));
        reset_schedule_start_node(String(value || ""));
      },
    }),
    select_schedule_start$: new Timeless.vm.SelectCore({
      placeholder: "开始节点（默认）",
      position: "popper",
      options: [],
    }),
    input_create_name$: new Timeless.vm.InputCore({
      placeholder: "Pipeline 名称",
      onChange(value) {
        create_name_.as(value);
      },
    }),
    input_create_description$: new Timeless.vm.InputCore({
      placeholder: "可选",
      onChange(value) {
        create_description_.as(value);
      },
    }),
    input_create_event_key$: new Timeless.vm.InputCore({
      placeholder: "例如：channels.feed.received",
      onChange(value) {
        create_event_key_.as(value);
      },
    }),
    input_create_cron$: new Timeless.vm.InputCore({
      placeholder: "@daily 或 0 8 * * *",
      onChange(value) {
        create_cron_.as(value);
      },
    }),
    input_add_name$: new Timeless.vm.InputCore({
      placeholder: "节点名称",
      onChange(value) {
        add_name_.as(value);
      },
    }),
    input_add_config$: new Timeless.vm.InputCore({
      placeholder: "{}",
      onChange(value) {
        add_config_.as(value);
      },
    }),
    input_edit_node_name$: new Timeless.vm.InputCore({
      placeholder: "节点名称",
      onChange(value) {
        update_selected_node({ name: String(value || "") });
      },
    }),
    input_edit_node_config$: new Timeless.vm.InputCore({
      defaultValue: "{}",
      placeholder: "{}",
      onChange(value) {
        edit_node_config_.as(String(value || ""));
      },
    }),
    input_schedule_name$: new Timeless.vm.InputCore({
      placeholder: "流程名称",
      onChange(value) {
        schedule_name_.as(value);
      },
    }),
    input_schedule_cron$: new Timeless.vm.InputCore({
      placeholder: "@daily 或 0 8 * * *",
      onChange(value) {
        schedule_cron_.as(value);
      },
    }),
    input_schedule_event_key$: new Timeless.vm.InputCore({
      placeholder: "例如：channels.feed.received",
      onChange(value) {
        schedule_event_key_.as(value);
      },
    }),
    btn_refresh$: new Timeless.vm.ButtonCore({
      variant: "outline",
      disabled: loading_.value,
      onClick() {
        return load_data({ silent: true });
      },
    }),
    btn_create_pipeline$: new Timeless.vm.ButtonCore({
      variant: "primary",
      onClick() {
        return open_create_dialog();
      },
    }),
    btn_create_submit$: new Timeless.vm.ButtonCore({
      variant: "primary",
      disabled: create_submitting_.value,
      onClick() {
        return submit_pipeline_create();
      },
    }),
    btn_create_cancel$: new Timeless.vm.ButtonCore({
      variant: "ghost",
      onClick() {
        ui.create_dialog$.hide();
      },
    }),
    btn_add_node$: new Timeless.vm.ButtonCore({
      variant: "outline",
      size: "sm",
      onClick() {
        return open_add_dialog();
      },
    }),
    btn_add_submit$: new Timeless.vm.ButtonCore({
      variant: "primary",
      disabled: add_submitting_.value,
      onClick() {
        return submit_add_node();
      },
    }),
    btn_apply_node_config$: new Timeless.vm.ButtonCore({
      variant: "outline",
      size: "sm",
      onClick() {
        return apply_selected_node_config();
      },
    }),
    btn_remove_selected_node$: new Timeless.vm.ButtonCore({
      variant: "danger",
      size: "sm",
      onClick() {
        return remove_node(selected_edit_node_id_.value);
      },
    }),
    btn_add_cancel$: new Timeless.vm.ButtonCore({
      variant: "ghost",
      onClick() {
        ui.add_dialog$.hide();
      },
    }),
    btn_save_flow$: new Timeless.vm.ButtonCore({
      variant: "primary",
      size: "sm",
      disabled: true,
      onClick() {
        return save_flow();
      },
    }),
    btn_run_flow$: new Timeless.vm.ButtonCore({
      variant: "outline",
      size: "sm",
      onClick() {
        return trigger_flow();
      },
    }),
    btn_delete_flow$: new Timeless.vm.ButtonCore({
      variant: "danger",
      size: "sm",
      onClick() {
        ui.delete_dialog$.show();
        return null;
      },
    }),
    btn_schedule_create$: new Timeless.vm.ButtonCore({
      variant: "outline",
      size: "sm",
      onClick() {
        return open_schedule_dialog();
      },
    }),
    btn_schedule_submit$: new Timeless.vm.ButtonCore({
      variant: "primary",
      disabled: schedule_submitting_.value,
      onClick() {
        return submit_schedule();
      },
    }),
    btn_schedule_cancel$: new Timeless.vm.ButtonCore({
      variant: "ghost",
      onClick() {
        ui.schedule_dialog$.hide();
      },
    }),
    checkbox_create_enabled$: new Timeless.vm.CheckboxCore({
      checked: true,
      onChange(value) {
        create_enabled_.as(value);
      },
    }),
    btn_schedule_toggle$: new Timeless.vm.ButtonInListCore({
      variant: "outline",
      size: "xs",
      onClick(schedule) {
        return schedule_action(schedule && schedule.id, "toggle");
      },
    }),
    btn_schedule_trigger$: new Timeless.vm.ButtonInListCore({
      variant: "outline",
      size: "xs",
      onClick(schedule) {
        return schedule_action(schedule && schedule.id, "trigger");
      },
    }),
    btn_param_remove$: new Timeless.vm.ButtonInListCore({
      variant: "ghost",
      size: "sm",
      onClick(param) {
        remove_create_param(param);
      },
    }),
    btn_param_add$: new Timeless.vm.ButtonCore({
      variant: "outline",
      size: "sm",
      onClick() {
        add_create_param();
      },
    }),
  };

  if (ui.delete_dialog$.okBtn) {
    ui.delete_dialog$.okBtn.setVariant("destructive");
  }

  loading_.subscribe({
    onChange(loading) {
      if (loading) ui.btn_refresh$.disable();
      else ui.btn_refresh$.enable();
    },
  });
  create_submitting_.subscribe({
    onChange(submitting) {
      if (submitting) ui.btn_create_submit$.disable();
      else ui.btn_create_submit$.enable();
    },
  });
  add_submitting_.subscribe({
    onChange(submitting) {
      if (submitting) ui.btn_add_submit$.disable();
      else ui.btn_add_submit$.enable();
    },
  });
  schedule_submitting_.subscribe({
    onChange(submitting) {
      if (submitting) ui.btn_schedule_submit$.disable();
      else ui.btn_schedule_submit$.enable();
    },
  });
  dirty_.subscribe({
    onChange(dirty) {
      if (dirty) ui.btn_save_flow$.enable();
      else ui.btn_save_flow$.disable();
    },
  });
  catalog_.subscribe({
    onChange(catalog) {
      ui.select_add_type$.setOptions(
        catalog.map(
          (item) =>
            new Timeless.vm.SelectItemCore({
              label: `${item.name}（${item.type}）`,
              value: item.type,
            }),
        ),
      );
    },
  });
  edit_nodes_.subscribe({
    onChange() {
      const options = (edit_nodes_.value || []).map(
        (node) =>
          new Timeless.vm.SelectItemCore({
            label: `${node.name || node.id}（${node.id}）`,
            value: node.id,
          }),
      );
      ui.select_add_from$.setOptions(options);
      ui.select_schedule_start$.setOptions(options);
    },
  });

  function default_config_json(node_type) {
    const defaults = {
      ExprNode: { expression: "", output_key: "calc_out" },
      APICallNode: { url: "", method: "GET", keys: [] },
      GatewayNode: { gateway_type: "Exclusive", rules: [] },
    };
    const config = defaults[node_type] || {};
    return JSON.stringify(config, null, 2);
  }

  function find_pipeline(flow_id) {
    const pipelines = pipelines_.value || [];
    return pipelines.find((pipeline) => pipeline.id === flow_id) || null;
  }

  function pipeline_name(flow_id) {
    const pipeline = find_pipeline(flow_id);
    return pipeline ? pipeline.name || pipeline.id : flow_id || "-";
  }

  function set_error(error) {
    error_.as(error && error.message ? error.message : String(error || ""));
    loading_.as(false);
  }

  async function load_pipelines() {
    const r = await reqs.pipeline.list.run({});
    if (r.error) {
      throw request_result_error(r, "Pipeline 列表加载失败");
    }
    const payload = r.data;
    return ((payload && payload.list) || [])
      .map(normalize_pipeline)
      .filter((pipeline) => pipeline.id);
  }

  async function load_catalog() {
    const r = await reqs.pipeline.catalog.run({});
    if (r.error) {
      throw request_result_error(r, "节点类型加载失败");
    }
    const payload = r.data;
    return (payload && payload.nodes) || [];
  }

  async function load_schedules() {
    const r = await reqs.schedule.list.run({
      page: 1,
      page_size: 100,
    });
    if (r.error) {
      throw request_result_error(r, "自动化列表加载失败");
    }
    const payload = r.data;
    return (payload && payload.list) || [];
  }

  async function load_runs(schedule_id) {
    const r = await reqs.running.list.run({
      schedule_id,
      page: 1,
      page_size: 20,
    });
    if (r.error) {
      throw request_result_error(r, "执行记录加载失败");
    }
    const payload = r.data;
    runs_.as((payload && payload.list) || [], { reset: true });
  }

  async function load_data(options) {
    options = options || {};
    const sequence = ++request_sequence;
    loading_.as(true);
    error_.as("");
    if (!options.silent) notice_.as("");
    try {
      const [pipelines, catalog, schedules] = await Promise.all([
        load_pipelines(),
        load_catalog(),
        load_schedules(),
      ]);
      if (sequence !== request_sequence) return;
      pipelines_.as(pipelines, { reset: true });
      catalog_.as(catalog, { reset: true });
      schedules_.as(schedules, { reset: true });
      if (selected_flow_id_.value) {
        const fresh = pipelines.find(
          (item) => item.id === selected_flow_id_.value,
        );
        if (fresh) enter_edit(fresh);
        else {
          selected_pipeline_.as(null);
          edit_nodes_.as([], { reset: true });
          if (view_mode_.value === "list") selected_flow_id_.as("");
        }
      }
      if (selected_schedule_id_.value) {
        const selected = schedules.find(
          (item) => item.id === selected_schedule_id_.value,
        );
        if (!selected) {
          selected_schedule_id_.as("");
          runs_.as([], { reset: true });
        } else {
          await load_runs(selected.id);
        }
      }
      if (sequence !== request_sequence) return;
      loading_.as(false);
    } catch (err) {
      if (sequence !== request_sequence) return;
      set_error(err);
    }
  }

  function enter_edit(flow) {
    staged_node_positions.clear();
    selected_pipeline_.as(flow);
    const edit_nodes = (flow.nodes || []).map((node) => ({
      id: node.id,
      type: node.type,
      name: node.name || node.id,
      config: node.config || {},
      position: node.position ? { ...node.position } : null,
      next_ids: (node.next_ids || []).slice(),
      input_schema: node.input_schema || [],
    }));
    const calculated_positions = calculate_pipeline_node_positions(edit_nodes);
    edit_nodes_.as(
      edit_nodes.map((node) => ({
        ...node,
        position: calculated_positions[node.id] || null,
      })),
      { reset: true },
    );
    edit_start_node_id_.as(flow.start_node_id || "");
    const preferred_node_id = (flow.nodes || []).some(
      (node) => node.id === selected_edit_node_id_.value,
    )
      ? selected_edit_node_id_.value
      : flow.start_node_id || ((flow.nodes || [])[0] || {}).id || "";
    select_edit_node(preferred_node_id);
    dirty_.as(false);
  }

  function find_edit_node(node_id) {
    return (edit_nodes_.value || []).find((node) => node.id === node_id) || null;
  }

  function select_edit_node(node_id) {
    const node = find_edit_node(String(node_id || ""));
    selected_edit_node_id_.as(node ? node.id : "");
    const config_text = JSON.stringify((node && node.config) || {}, null, 2);
    edit_node_config_.as(config_text);
    ui.input_edit_node_name$.setValue((node && node.name) || "", {
      silence: true,
    });
    ui.input_edit_node_config$.setValue(config_text, { silence: true });
    return node;
  }

  function update_selected_node(patch) {
    const node_id = selected_edit_node_id_.value;
    if (!node_id) return null;
    edit_nodes_.as(
      (edit_nodes_.value || []).map((node) =>
        node.id === node_id ? { ...node, ...patch } : node,
      ),
      { reset: true },
    );
    dirty_.as(true);
    return find_edit_node(node_id);
  }

  function move_edit_node(node_id, position) {
    const id = String(node_id || "");
    if (!position || typeof position !== "object") return null;
    const x = Number(position.x);
    const y = Number(position.y);
    if (!id || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    staged_node_positions.set(id, { x, y });
    let moved_node = null;
    edit_nodes_.as(
      (edit_nodes_.value || []).map((node) => {
        if (node.id !== id) return node;
        moved_node = { ...node, position: { x, y } };
        return moved_node;
      }),
      { reset: true },
    );
    if (moved_node) dirty_.as(true);
    return moved_node;
  }

  function stage_edit_node_position(node_id, position) {
    const id = String(node_id || "");
    if (!position || typeof position !== "object") return null;
    const x = Number(position.x);
    const y = Number(position.y);
    if (!id || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const staged_position = { x, y };
    staged_node_positions.set(id, staged_position);
    dirty_.as(true);
    return staged_position;
  }

  function apply_selected_node_config() {
    const node_id = selected_edit_node_id_.value;
    if (!node_id) return null;
    error_.as("");
    try {
      const raw = String(edit_node_config_.value || "").trim();
      const config = raw ? JSON.parse(raw) : {};
      if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new Error("节点配置必须是 JSON 对象");
      }
      update_selected_node({ config });
      notice_.as("节点配置已应用，保存 Pipeline 后生效");
    } catch (err) {
      set_error(err);
    }
    return null;
  }

  async function select_pipeline(flow_id, options) {
    options = options || {};
    selected_flow_id_.as(flow_id);
    tab_.as("pipelines");
    selected_schedule_id_.as("");
    runs_.as([], { reset: true });
    const pipeline = find_pipeline(flow_id);
    if (pipeline) enter_edit(pipeline);
    else selected_pipeline_.as(null);
    if (!options.silent) {
      const r = await reqs.pipeline.detail.run({ id: flow_id });
      if (r.error) {
        set_error(request_result_error(r, "Pipeline 详情加载失败"));
        return;
      }
      if (selected_flow_id_.value !== flow_id) return;
      const flow = normalize_pipeline(r.data);
      if (flow.id) {
        pipelines_.as(
          (pipelines_.value || []).map((item) =>
            item.id === flow.id ? flow : item,
          ),
          { reset: true },
        );
        enter_edit(flow);
      }
    }
  }

  async function select_schedule(id) {
    selected_schedule_id_.as(id);
    tab_.as("schedules");
    const sequence = ++request_sequence;
    loading_.as(true);
    try {
      const r = await reqs.schedule.detail.run({
        id,
      });
      if (r.error) {
        return;
      }
      const schedule = r.data;
      if (sequence !== request_sequence) return;
      schedules_.as(
        (schedules_.value || []).map((item) =>
          item.id === id ? schedule : item,
        ),
        { reset: true },
      );
      const pipeline = find_pipeline(schedule.flow_id);
      selected_flow_id_.as(schedule.flow_id);
      if (pipeline) enter_edit(pipeline);
      await load_runs(id);
      loading_.as(false);
    } catch (err) {
      if (sequence !== request_sequence) return;
      set_error(err);
    }
  }

  // --- create pipeline ---
  function open_create_dialog() {
    create_trigger_type_.as("Cron");
    create_name_.as("");
    create_description_.as("");
    create_event_key_.as("");
    create_cron_.as("@daily");
    create_enabled_.as(true);
    create_params_.as([new_create_param_row()], {
      reset: true,
    });
    ui.input_create_name$.setValue("", { silence: true });
    ui.input_create_description$.setValue("", { silence: true });
    ui.input_create_event_key$.setValue("", { silence: true });
    ui.input_create_cron$.setValue("@daily", { silence: true });
    if (ui.checkbox_create_enabled$.value !== true) {
      ui.checkbox_create_enabled$.check();
    }
    create_open_.as(true);
    ui.create_dialog$.show();
  }

  function new_create_param_row() {
    const uid = ++param_sequence;
    const param = { uid, key: "", type: "string", required: false };
    param.input_key$ = new Timeless.vm.InputCore({
      defaultValue: "",
      placeholder: "例如 url",
      onChange(value) {
        update_create_param(param, { key: value });
      },
    });
    param.select_type$ = new Timeless.vm.SelectCore({
      value: param.type,
      position: "popper",
      options: ["string", "number", "boolean", "any"].map(
        (type) => new Timeless.vm.SelectItemCore({ label: type, value: type }),
      ),
      onChange(value) {
        update_create_param(param, { type: String(value || "string") });
      },
    });
    return param;
  }

  function set_create_trigger_type(type) {
    create_trigger_type_.as(type);
  }

  function add_create_param() {
    create_params_.as([...create_params_.value, new_create_param_row()], {
      reset: true,
    });
  }

  function remove_create_param(param) {
    create_params_.as(
      create_params_.value.filter((item) => item.uid !== param.uid),
      { reset: true },
    );
  }

  function update_create_param(param, patch) {
    create_params_.as(
      create_params_.value.map((item) =>
        item.uid === param.uid ? { ...item, ...patch } : item,
      ),
      { reset: true },
    );
  }

  async function submit_pipeline_create() {
    if (create_submitting_.value) {
      return null;
    }
    create_submitting_.as(true);
    error_.as("");
    try {
      const trigger_type = create_trigger_type_.value;
      const event_key = String(create_event_key_.value || "").trim();
      const name = String(create_name_.value || "").trim();
      if (!name) throw new Error("请输入 Pipeline 名称");
      if (trigger_type === "Event" && !event_key) {
        throw new Error("请输入事件 Key");
      }
      const context_schema = [];
      (create_params_.value || []).forEach((param) => {
        const key = String(param.key || "").trim();
        if (!key) return;
        context_schema.push({
          key,
          type: param.type || "string",
          required: Boolean(param.required),
        });
      });
      const r = await reqs.pipeline.create.run({
        name,
        description: String(create_description_.value || "").trim(),
        trigger_type,
        event_key: trigger_type === "Event" ? event_key : "",
        context_schema,
      });
      if (r.error) throw request_result_error(r, "Pipeline 创建失败");
      const flow = r.data;
      ui.create_dialog$.hide();
      create_open_.as(false);
      let create_notice = "Pipeline 创建成功，可继续添加后续节点";
      // Cron-triggered pipelines also need a schedule to fire.
      if (trigger_type === "Cron" && create_enabled_.value) {
        const schedule_result = await reqs.schedule.create.run({
          name: `${name} 定时`,
          cron_expr: String(create_cron_.value || "").trim() || "@daily",
          flow_id: flow.id,
          initial_data: {
            __automation: { type: "Cron", start_node: "start" },
          },
          enabled: true,
        });
        if (schedule_result.error) {
          const schedule_error = request_result_error(
            schedule_result,
            "定时计划创建失败",
          );
          create_notice = `Pipeline 已创建，但定时计划创建失败：${schedule_error.message}`;
        }
      }
      await load_data({ silent: true });
      await select_pipeline(flow.id, { silent: true });
      notice_.as(create_notice);
    } catch (err) {
      set_error(err);
    } finally {
      create_submitting_.as(false);
    }
    return null;
  }

  // --- editor: add / remove nodes ---
  function open_add_dialog(node_type, from_node_id) {
    if (!selected_pipeline_.value) return null;
    const nodes = edit_nodes_.value || [];
    const last = nodes.length > 0 ? nodes[nodes.length - 1] : null;
    const selected = find_edit_node(selected_edit_node_id_.value);
    const requested_from = find_edit_node(String(from_node_id || ""));
    const from_node = requested_from || selected || last;
    if (requested_from) {
      select_edit_node(requested_from.id);
    }
    const requested_type = String(node_type || "").trim();
    add_type_.as(requested_type);
    add_name_.as("");
    add_config_.as("{}");
    add_from_.as(from_node ? from_node.id : "");
    ui.input_add_name$.setValue("", { silence: true });
    ui.input_add_config$.setValue("{}", { silence: true });
    ui.select_add_type$.setValue(requested_type, {
      silence: !requested_type,
    });
    ui.select_add_from$.setValue(from_node ? from_node.id : "", {
      silence: true,
    });
    add_open_.as(true);
    ui.add_dialog$.show();
    return null;
  }

  async function submit_add_node() {
    if (add_submitting_.value) return null;
    add_submitting_.as(true);
    error_.as("");
    try {
      const node_type = String(add_type_.value || "").trim();
      if (!node_type) throw new Error("请选择节点类型");
      let config = {};
      const config_raw = String(add_config_.value || "").trim();
      if (config_raw) {
        config = JSON.parse(config_raw);
        if (!config || typeof config !== "object" || Array.isArray(config)) {
          throw new Error("节点配置必须是 JSON 对象");
        }
      }
      const node_id = `node-${Date.now()}-${++node_sequence}`;
      const nodes = (edit_nodes_.value || []).slice();
      const new_node = {
        id: node_id,
        type: node_type,
        name: String(add_name_.value || "").trim() || flow_label(node_type),
        config,
        next_ids: [],
        input_schema: [],
      };
      const from_id = String(add_from_.value || "").trim();
      if (from_id) {
        const from_index = nodes.findIndex((node) => node.id === from_id);
        if (from_index >= 0) {
          new_node.next_ids = nodes[from_index].next_ids.slice();
          nodes[from_index] = {
            ...nodes[from_index],
            next_ids: [node_id],
          };
        }
      }
      nodes.push(new_node);
      const calculated_positions = calculate_pipeline_node_positions(nodes);
      edit_nodes_.as(
        nodes.map((node) => ({
          ...node,
          position: calculated_positions[node.id] || null,
        })),
        { reset: true },
      );
      select_edit_node(node_id);
      dirty_.as(true);
      ui.add_dialog$.hide();
      add_open_.as(false);
      notice_.as("节点已添加，记得保存 Pipeline");
    } catch (err) {
      set_error(err);
    }
    add_submitting_.as(false);
    return null;
  }

  function remove_node(node_id) {
    if (node_id === edit_start_node_id_.value) {
      error_.as("开始节点不能删除");
      return;
    }
    staged_node_positions.delete(node_id);
    const nodes = (edit_nodes_.value || [])
      .filter((node) => node.id !== node_id)
      .map((node) => ({
        ...node,
        next_ids: (node.next_ids || []).filter((id) => id !== node_id),
      }));
    edit_nodes_.as(nodes, { reset: true });
    if (selected_edit_node_id_.value === node_id) {
      select_edit_node(edit_start_node_id_.value);
    }
    dirty_.as(true);
  }

  async function save_flow() {
    if (!selected_pipeline_.value || saving_.value) return null;
    saving_.as(true);
    error_.as("");
    try {
      const calculated_positions = calculate_pipeline_node_positions(
        edit_nodes_.value,
      );
      const r = await reqs.pipeline.update.run({
        id: selected_flow_id_.value,
        start_node_id: edit_start_node_id_.value,
        nodes: (edit_nodes_.value || []).map((node) => ({
          id: node.id,
          type: node.type,
          name: node.name,
          config: node.config || {},
          position:
            staged_node_positions.get(node.id) ||
            calculated_positions[node.id] ||
            null,
          input_schema: node.input_schema || [],
          next_ids: node.next_ids || [],
        })),
      });
      if (r.error) throw request_result_error(r, "Pipeline 保存失败");
      dirty_.as(false);
      notice_.as("Pipeline 已保存");
      await load_data({ silent: true });
    } catch (err) {
      set_error(err);
    }
    saving_.as(false);
    return null;
  }

  async function delete_flow() {
    const flow_id = selected_flow_id_.value;
    if (!flow_id) return null;
    error_.as("");
    try {
      const r = await reqs.pipeline.delete.run({ id: flow_id });
      if (r.error) throw request_result_error(r, "Pipeline 删除失败");
      ui.delete_dialog$.hide();
      selected_flow_id_.as("");
      selected_pipeline_.as(null);
      edit_nodes_.as([], { reset: true });
      notice_.as("Pipeline 已删除");
      await load_data({ silent: true });
    } catch (err) {
      set_error(err);
    }
    return null;
  }

  async function trigger_flow() {
    const flow_id = selected_flow_id_.value;
    if (!flow_id) return null;
    error_.as("");
    try {
      const r = await reqs.pipeline.trigger.run({ id: flow_id });
      if (r.error) {
        return;
      }
      notice_.as(`已触发执行（${r.data.status || "RUNNING"}）`);
    } catch (err) {
      set_error(err);
    }
    return null;
  }

  // --- schedules ---
  function open_schedule_dialog(flow_id) {
    const target_flow_id = flow_id || selected_flow_id_.value;
    if (!target_flow_id) {
      error_.as("请先创建或选择一个 Pipeline");
      return null;
    }
    schedule_flow_id_.as(target_flow_id);
    schedule_trigger_type_.as("Cron");
    schedule_event_key_.as("");
    schedule_name_.as(`${pipeline_name(target_flow_id)} 自动化`);
    schedule_cron_.as("@daily");
    schedule_start_node_.as("");
    ui.select_schedule_flow$.setOptions(
      (pipelines_.value || []).map(
        (item) =>
          new Timeless.vm.SelectItemCore({
            label: `${item.name || item.id}（${item.id}）`,
            value: item.id,
          }),
      ),
    );
    ui.select_schedule_flow$.setValue(target_flow_id, { silence: true });
    reset_schedule_start_node(target_flow_id);
    ui.input_schedule_name$.setValue(schedule_name_.value, { silence: true });
    ui.input_schedule_cron$.setValue("@daily", { silence: true });
    ui.input_schedule_event_key$.setValue("", { silence: true });
    schedule_open_.as(true);
    ui.schedule_dialog$.show();
    return null;
  }

  function reset_schedule_start_node(flow_id) {
    const pipeline = find_pipeline(flow_id);
    const start_node_id = pipeline ? pipeline.start_node_id : "";
    schedule_start_node_.as(start_node_id);
    ui.select_schedule_start$.setValue(start_node_id, { silence: true });
  }

  function set_schedule_trigger_type(type) {
    schedule_trigger_type_.as(type);
  }

  async function submit_schedule() {
    if (schedule_submitting_.value) return null;
    schedule_submitting_.as(true);
    error_.as("");
    try {
      const trigger_type = schedule_trigger_type_.value;
      const event_key = String(schedule_event_key_.value || "").trim();
      const name = String(schedule_name_.value || "").trim();
      if (!name) throw new Error("请输入流程名称");
      if (trigger_type === "Event" && !event_key) {
        throw new Error("请输入事件 Key");
      }
      const initial_data = {};
      initial_data.__automation = {
        type: trigger_type,
        start_node: String(ui.select_schedule_start$.value || ""),
        event_key: trigger_type === "Event" ? event_key : "",
      };
      const r = await reqs.schedule.create.run({
        name,
        cron_expr:
          trigger_type === "Cron"
            ? String(schedule_cron_.value || "").trim() || "@daily"
            : "@daily",
        flow_id: String(
          ui.select_schedule_flow$.value || schedule_flow_id_.value || "",
        ),
        initial_data,
        enabled: trigger_type === "Cron",
      });
      if (r.error) {
        return;
      }
      const schedule = r.data;
      ui.schedule_dialog$.hide();
      schedule_open_.as(false);
      notice_.as("自动化流程创建成功");
      selected_schedule_id_.as(schedule.id);
      tab_.as("schedules");
      await load_data({ silent: true });
      await select_schedule(schedule.id);
    } catch (err) {
      set_error(err);
    }
    schedule_submitting_.as(false);
    return null;
  }

  async function schedule_action(id, action) {
    const schedule = (schedules_.value || []).find((item) => item.id === id);
    const metadata = schedule_metadata(schedule);
    error_.as("");
    try {
      if (action === "toggle" && metadata.type === "Cron") {
        await reqs.schedule.toggle.run({ id });
        notice_.as("自动化状态已更新");
      } else if (action === "trigger") {
        await reqs.schedule.trigger.run({
          id,
          trigger_type: metadata.type === "Event" ? "Event" : "Manual",
          event_key: metadata.type === "Event" ? metadata.event_key : "",
        });
        notice_.as(
          metadata.type === "Event" ? "事件已触发" : "自动化流程已手动触发",
        );
      }
      await load_data({ silent: true });
    } catch (err) {
      set_error(err);
    }
  }

  const methods = {
    async ready() {
      await load_data();
      if (view_mode_.value !== "list" && selected_flow_id_.value) {
        await select_pipeline(selected_flow_id_.value);
      }
      return null;
    },
    refresh() {
      return load_data({ silent: true });
    },
    switchTab(tab) {
      tab_.as(tab);
    },
    selectPipeline: select_pipeline,
    selectSchedule: select_schedule,
    toggleSchedule(id) {
      return schedule_action(id, "toggle");
    },
    triggerSchedule(id) {
      return schedule_action(id, "trigger");
    },
    openCreateDialog: open_create_dialog,
    setCreateTriggerType: set_create_trigger_type,
    addCreateParam: add_create_param,
    removeCreateParam: remove_create_param,
    updateCreateParam: update_create_param,
    openAddDialog: open_add_dialog,
    selectEditNode: select_edit_node,
    stageEditNodePosition: stage_edit_node_position,
    moveEditNode: move_edit_node,
    applySelectedNodeConfig: apply_selected_node_config,
    removeNode: remove_node,
    saveFlow: save_flow,
    deleteFlow: delete_flow,
    triggerFlow: trigger_flow,
    openScheduleDialog: open_schedule_dialog,
    setScheduleTriggerType: set_schedule_trigger_type,
    scheduleMetadata: schedule_metadata,
    triggerLabel: trigger_label,
    effectiveStartNode: effective_start_node,
    schemaText: schema_text,
    formatTime: format_time,
    pipelineName: pipeline_name,
    flowLabel: flow_label,
    catalogDescription(node_type) {
      const item = (catalog_.value || []).find(
        (entry) => entry.type === node_type,
      );
      return item ? item.description : "";
    },
    catalogConfigKeys(node_type) {
      const item = (catalog_.value || []).find(
        (entry) => entry.type === node_type,
      );
      return item ? item.config_keys || [] : [];
    },
  };

  const state = {
    view_mode: view_mode_,
    tab: tab_,
    pipelines: pipelines_,
    catalog: catalog_,
    schedules: schedules_,
    runs: runs_,
    selected_flow_id: selected_flow_id_,
    selected_pipeline: selected_pipeline_,
    selected_schedule_id: selected_schedule_id_,
    selected_schedule: selected_schedule_,
    edit_nodes: edit_nodes_,
    edit_start_node_id: edit_start_node_id_,
    selected_edit_node_id: selected_edit_node_id_,
    edit_node_config: edit_node_config_,
    loading: loading_,
    error: error_,
    notice: notice_,
    dirty: dirty_,
    saving: saving_,
    create_open: create_open_,
    create_trigger_type: create_trigger_type_,
    create_name: create_name_,
    create_description: create_description_,
    create_event_key: create_event_key_,
    create_cron: create_cron_,
    create_enabled: create_enabled_,
    create_params: create_params_,
    add_open: add_open_,
    add_type: add_type_,
    add_name: add_name_,
    add_config: add_config_,
    add_from: add_from_,
    schedule_open: schedule_open_,
    schedule_trigger_type: schedule_trigger_type_,
    schedule_event_key: schedule_event_key_,
    schedule_name: schedule_name_,
    schedule_cron: schedule_cron_,
  };

  return { state, ui, methods };
}

export {
  AutomationPageViewModel,
  calculate_flow_minimap_geometry,
  calculate_pipeline_node_positions,
  normalize_pipeline,
};
