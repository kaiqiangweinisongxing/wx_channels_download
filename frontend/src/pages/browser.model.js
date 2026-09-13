import { request } from "@/biz/request.js";

function string_value(value) {
  return value === undefined || value === null ? "" : String(value);
}

function finite_number(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function valid_navigation_url(value) {
  try {
    const parsed_url = new URL(string_value(value).trim());
    return parsed_url.protocol === "http:" || parsed_url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalize_navigation_result(raw_result) {
  const source = raw_result && typeof raw_result === "object" ? raw_result : {};
  return {
    url: string_value(source.url),
    status_code: finite_number(source.status_code),
    content_type: string_value(source.content_type),
    rendered_html: string_value(source.rendered_html),
    executed_scripts: Math.max(0, finite_number(source.executed_scripts)),
    duration_ms: Math.max(0, finite_number(source.duration_ms)),
    navigation_history: Array.isArray(source.navigation_history)
      ? source.navigation_history.map(string_value).filter(Boolean)
      : [],
    network: Array.isArray(source.network)
      ? source.network.map((entry) => ({
          method: string_value(entry && entry.method) || "GET",
          url: string_value(entry && entry.url),
          status: finite_number(entry && entry.status),
          status_text: string_value(entry && entry.status_text),
          resource_type: string_value(entry && entry.resource_type) || "other",
          mime_type: string_value(entry && entry.mime_type),
          body_size: Math.max(0, finite_number(entry && entry.body_size)),
          duration_ms: Math.max(0, finite_number(entry && entry.duration_ms)),
          started_at: string_value(entry && entry.started_at),
          from_cache: Boolean(entry && entry.from_cache),
          error: string_value(entry && entry.error),
        }))
      : [],
    console_messages: Array.isArray(source.console_messages)
      ? source.console_messages.map((message) => ({
          level: string_value(message && message.level).toLowerCase() || "log",
          text: string_value(message && message.text),
          url: string_value(message && message.url),
        }))
      : [],
  };
}

export function format_navigation_har(raw_result) {
  const result = normalize_navigation_result(raw_result);
  const first_started_at = result.network.find((entry) => entry.started_at)?.started_at;
  const started_at = first_started_at || new Date().toISOString();
  const page_id = "page_1";
  const entries = result.network.map((entry) => ({
    pageref: page_id,
    startedDateTime: entry.started_at || started_at,
    time: entry.duration_ms,
    request: {
      method: entry.method,
      url: entry.url,
      httpVersion: "",
      cookies: [],
      headers: [],
      queryString: [],
      headersSize: -1,
      bodySize: 0,
    },
    response: {
      status: entry.status,
      statusText: entry.status_text,
      httpVersion: "",
      cookies: [],
      headers: [],
      content: {
        size: entry.body_size,
        mimeType: entry.mime_type,
      },
      redirectURL: "",
      headersSize: -1,
      bodySize: entry.body_size,
    },
    cache: {},
    timings: {
      blocked: -1,
      dns: -1,
      connect: -1,
      send: 0,
      wait: entry.duration_ms,
      receive: 0,
      ssl: -1,
    },
    _resourceType: entry.resource_type,
    ...(entry.from_cache ? { _fromCache: "memory" } : {}),
    ...(entry.error ? { _error: entry.error } : {}),
  }));
  return JSON.stringify(
    {
      log: {
        version: "1.2",
        creator: { name: "Minib Browser", version: "1.0" },
        pages: [
          {
            startedDateTime: started_at,
            id: page_id,
            title: result.url,
            pageTimings: {
              onContentLoad: -1,
              onLoad: result.duration_ms,
            },
          },
        ],
        entries,
      },
    },
    null,
    2,
  );
}

export function BrowserPageViewModel(props) {
  const url_ = ref("");
  const loading_ = ref(false);
  const error_ = ref("");
  const result_ = ref(null);
  const active_tab_ = ref("network");
  let request_sequence = 0;
  let destroyed = false;

  const navigate_request = new Timeless.kit.RequestCore(
    (body) => request.post("/api/minib/navigate", body),
    { client: props.client },
  );

  const ui = {
    input_url$: new Timeless.vm.InputCore({
      defaultValue: "",
      placeholder: "输入 HTTP 或 HTTPS 链接",
      type: "url",
      allowClear: true,
      autoFocus: true,
      onChange(value) {
        set_url(value);
      },
      onEnter() {
        return navigate();
      },
    }),
    btn_navigate$: new Timeless.vm.ButtonCore({
      disabled: true,
      variant: "primary",
      size: "lg",
      onClick() {
        return navigate();
      },
    }),
    btn_copy_html$: new Timeless.vm.ButtonCore({
      disabled: true,
      variant: "outline",
      size: "sm",
      onClick() {
        return copy_html();
      },
    }),
    btn_copy_har$: new Timeless.vm.ButtonCore({
      disabled: true,
      variant: "outline",
      size: "sm",
      onClick() {
        return copy_har();
      },
    }),
  };

  function sync_controls() {
    ui.btn_navigate$.setLoading(loading_.value);
    if (loading_.value || !string_value(url_.value).trim()) {
      ui.btn_navigate$.disable();
    } else {
      ui.btn_navigate$.enable();
    }
    const result = result_.value;
    if (result && result.rendered_html) {
      ui.btn_copy_html$.enable();
    } else {
      ui.btn_copy_html$.disable();
    }
    if (result) {
      ui.btn_copy_har$.enable();
    } else {
      ui.btn_copy_har$.disable();
    }
  }

  function show_copy_feedback(message) {
    if (window.DLUtils && window.DLUtils.toast) {
      window.DLUtils.toast(message);
    }
  }

  async function copy_text(value, success_message) {
    if (!value || !props.app || typeof props.app.copy !== "function") {
      return false;
    }
    try {
      await Promise.resolve(props.app.copy(value));
      show_copy_feedback(success_message);
      return true;
    } catch {
      show_copy_feedback("复制失败，请重试");
      return false;
    }
  }

  function copy_html() {
    const result = result_.value;
    return copy_text(result && result.rendered_html, "HTML 已复制");
  }

  function copy_har() {
    const result = result_.value;
    return copy_text(result && format_navigation_har(result), "HAR 已复制");
  }

  function set_url(value) {
    url_.as(string_value(value));
    error_.as("");
    sync_controls();
  }

  function set_active_tab(value) {
    if (value === "network" || value === "console") {
      active_tab_.as(value);
    }
  }

  async function navigate() {
    if (destroyed || loading_.value) {
      return null;
    }
    const navigation_url = string_value(url_.value).trim();
    if (!valid_navigation_url(navigation_url)) {
      error_.as("请输入有效的 HTTP 或 HTTPS 链接");
      return null;
    }

    const sequence = ++request_sequence;
    loading_.as(true);
    error_.as("");
    result_.as(null);
    sync_controls();

    try {
      const request_result = await navigate_request.run({ url: navigation_url });
      if (destroyed || sequence !== request_sequence) {
        return request_result;
      }
      if (request_result.error) {
        error_.as(request_result.error.message || String(request_result.error));
        return request_result;
      }
      const normalized_result = normalize_navigation_result(request_result.data);
      result_.as(normalized_result);
      if (normalized_result.url) {
        url_.as(normalized_result.url);
        ui.input_url$.setValue(normalized_result.url, { silence: true });
      }
      sync_controls();
      return request_result;
    } catch (error) {
      if (!destroyed && sequence === request_sequence) {
        error_.as(error && error.message ? error.message : String(error));
      }
      return null;
    } finally {
      if (!destroyed && sequence === request_sequence) {
        loading_.as(false);
        sync_controls();
      }
    }
  }

  function destroy() {
    destroyed = true;
    request_sequence += 1;
    navigate_request.destroy();
    Object.values(ui).forEach((store) => {
      if (store && typeof store.destroy === "function") {
        store.destroy();
      }
    });
  }

  sync_controls();

  return {
    state: {
      url: url_,
      loading: loading_,
      error: error_,
      result: result_,
      active_tab: active_tab_,
    },
    ui,
    methods: {
      copy_har,
      copy_html,
      destroy,
      navigate,
      set_active_tab,
      set_url,
    },
  };
}
