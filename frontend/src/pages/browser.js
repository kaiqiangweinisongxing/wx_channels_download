import { Button, Input, Tab, Tabs, Tag } from "../dmui.js";
import { BrowserPageViewModel } from "./browser.model.js";

function format_bytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function format_duration(value) {
  const milliseconds = Number(value) || 0;
  return milliseconds < 1000
    ? `${milliseconds.toFixed(0)} ms`
    : `${(milliseconds / 1000).toFixed(2)} s`;
}

function network_status_variant(entry) {
  if (entry.error || entry.status === 0 || entry.status >= 400) return "danger";
  if (entry.status >= 300) return "warning";
  return "success";
}

function console_level_variant(level) {
  if (level === "error") return "danger";
  if (level === "warn") return "warning";
  if (level === "info") return "info";
  return "default";
}

function BrowserAddressBar(props) {
  const vm$ = props.store;
  return View(
    {
      type: "form",
      class: "browser-address-bar dm-panel",
      attributes: { n: "browser-address-bar", role: "search" },
      onSubmit(event) {
        event.preventDefault();
        vm$.methods.navigate();
      },
    },
    [
      View(
        {
          class: "browser-address-input",
          attributes: { n: "browser-address-input" },
        },
        [
          Input({
            store: vm$.ui.input_url$,
            rootAttributes: { n: "browser-address-input-wrapper" },
            attributes: {
              n: "browser-address-input-control",
              "aria-label": "页面链接",
              autocomplete: "url",
              spellcheck: "false",
            },
            prefix: Timeless.Icon({
              name: "globe",
              size: 16,
              attributes: { n: "browser-address-icon" },
            }),
          }),
        ],
      ),
      Button(
        {
          store: vm$.ui.btn_navigate$,
          attributes: { n: "browser-navigate-button", type: "submit" },
          prefix: Timeless.Icon({
            name: "arrow-right",
            size: 16,
            attributes: { n: "browser-navigate-icon" },
          }),
        },
        ["导航"],
      ),
    ],
  );
}

function BrowserHTMLPanel(props) {
  const vm$ = props.store;
  return View(
    {
      class: "browser-html-panel dm-panel",
      attributes: { n: "browser-html-panel" },
    },
    [
      View(
        {
          class: "browser-panel-heading",
          attributes: { n: "browser-html-heading" },
        },
        [
          View({ class: "browser-panel-title" }, ["HTML"]),
          Show({
            when: vm$.state.result,
            ok() {
              const result = vm$.state.result.value;
              return View({ class: "browser-panel-meta" }, [
                Tag(
                  {
                    name: "browser-status-code",
                    variant:
                      result.status_code >= 200 && result.status_code < 400
                        ? "success"
                        : "danger",
                  },
                  [String(result.status_code || "-")],
                ),
                View(
                  {
                    class: "browser-final-url",
                    attributes: {
                      n: "browser-final-url",
                      title: result.url,
                    },
                  },
                  [result.url],
                ),
                Button(
                  {
                    store: vm$.ui.btn_copy_html$,
                    attributes: {
                      n: "browser-copy-html-button",
                      type: "button",
                      title: "复制导航后的 HTML",
                    },
                    prefix: Timeless.Icon({
                      name: "copy",
                      size: 14,
                      attributes: { n: "browser-copy-html-icon" },
                    }),
                  },
                  ["复制 HTML"],
                ),
              ]);
            },
          }),
        ],
      ),
      Show({
        when: vm$.state.loading,
        ok() {
          return View(
            {
              class: "browser-panel-state",
              attributes: { n: "browser-html-loading", role: "status" },
            },
            [
              View({ class: "dm-spinner", attributes: { "aria-hidden": "true" } }),
              View({}, ["Minib 正在导航并执行页面脚本…"]),
            ],
          );
        },
      }),
      Show({
        when: combine(
          { loading: vm$.state.loading, result: vm$.state.result },
          (state) => !state.loading && !state.result,
        ),
        ok() {
          return View(
            {
              class: "browser-panel-state",
              attributes: { n: "browser-html-empty" },
            },
            ["输入链接并导航后，这里会显示 Minib 生成的 HTML。"],
          );
        },
      }),
      Show({
        when: combine(
          { loading: vm$.state.loading, result: vm$.state.result },
          (state) => !state.loading && Boolean(state.result),
        ),
        ok() {
          return View(
            {
              type: "pre",
              class: "browser-html-source",
              attributes: { n: "browser-html-source", tabindex: "0" },
            },
            [computed(vm$.state.result, (result) => result.rendered_html || "")],
          );
        },
      }),
    ],
  );
}

function BrowserNetworkPanel(props) {
  const entries = props.result.network;
  if (entries.length === 0) {
    return View(
      { class: "browser-devtools-empty", attributes: { n: "browser-network-empty" } },
      ["本次导航没有记录到请求。"],
    );
  }
  return View(
    {
      class: "browser-network-table-wrap",
      attributes: { n: "browser-network-panel", role: "region", "aria-label": "Network" },
    },
    [
      View({ class: "browser-network-table", attributes: { role: "table" } }, [
        View({ class: "browser-network-row browser-network-head", attributes: { role: "row" } }, [
          View({ attributes: { role: "columnheader" } }, ["Method"]),
          View({ attributes: { role: "columnheader" } }, ["URL"]),
          View({ attributes: { role: "columnheader" } }, ["Status"]),
          View({ attributes: { role: "columnheader" } }, ["Type"]),
          View({ attributes: { role: "columnheader" } }, ["Size"]),
          View({ attributes: { role: "columnheader" } }, ["Time"]),
        ]),
        For({
          each: entries,
          render(entry) {
            return View(
              {
                class: "browser-network-row",
                attributes: { n: "browser-network-row", role: "row", title: entry.error || entry.url },
              },
              [
                View({ class: "browser-network-method", attributes: { role: "cell" } }, [entry.method]),
                View({ class: "browser-network-url", attributes: { role: "cell", title: entry.url } }, [entry.url]),
                View({ attributes: { role: "cell" } }, [
                  Tag({ name: "browser-network-status", variant: network_status_variant(entry) }, [
                    entry.error ? "ERR" : String(entry.status || "-"),
                  ]),
                ]),
                View({ class: "browser-network-type", attributes: { role: "cell", title: entry.mime_type } }, [entry.resource_type]),
                View({ attributes: { role: "cell" } }, [format_bytes(entry.body_size)]),
                View({ attributes: { role: "cell" } }, [format_duration(entry.duration_ms)]),
              ],
            );
          },
        }),
      ]),
    ],
  );
}

function BrowserConsolePanel(props) {
  const messages = props.result.console_messages;
  if (messages.length === 0) {
    return View(
      { class: "browser-devtools-empty", attributes: { n: "browser-console-empty" } },
      ["本次导航没有前端输出。"],
    );
  }
  return View(
    { class: "browser-console-list", attributes: { n: "browser-console-panel", role: "log" } },
    [
      For({
        each: messages,
        render(message) {
          return View(
            {
              class: `browser-console-row is-${message.level}`,
              attributes: { n: "browser-console-row", title: message.url || message.text },
            },
            [
              Tag({ name: "browser-console-level", variant: console_level_variant(message.level) }, [message.level]),
              View({ class: "browser-console-message" }, [message.text]),
              message.url
                ? View({ class: "browser-console-url", attributes: { title: message.url } }, [message.url])
                : null,
            ].filter(Boolean),
          );
        },
      }),
    ],
  );
}

function BrowserDevtools(props) {
  const vm$ = props.store;
  return View(
    { class: "browser-devtools dm-panel", attributes: { n: "browser-devtools" } },
    [
      Show({
        when: vm$.state.result,
        ok() {
          const result = vm$.state.result.value;
          return [
            View(
              {
                class: "browser-devtools-toolbar",
                attributes: { n: "browser-devtools-toolbar" },
              },
              [
                Tabs(
                  {
                    class: "browser-devtools-tabs",
                    attributes: { n: "browser-devtools-tabs" },
                  },
                  [
                    Tab(
                      {
                        selected: computed(
                          vm$.state.active_tab,
                          (tab) => tab === "network",
                        ),
                        attributes: {
                          n: "browser-network-tab",
                          "aria-controls": "browser-network-content",
                        },
                        onClick() {
                          vm$.methods.set_active_tab("network");
                        },
                      },
                      [`Network (${result.network.length})`],
                    ),
                    Tab(
                      {
                        selected: computed(
                          vm$.state.active_tab,
                          (tab) => tab === "console",
                        ),
                        attributes: {
                          n: "browser-console-tab",
                          "aria-controls": "browser-console-content",
                        },
                        onClick() {
                          vm$.methods.set_active_tab("console");
                        },
                      },
                      [`Console (${result.console_messages.length})`],
                    ),
                  ],
                ),
                View(
                  {
                    class: "browser-devtools-actions",
                    attributes: { n: "browser-devtools-actions" },
                  },
                  [
                    View({ class: "browser-devtools-summary" }, [
                      `${result.executed_scripts} scripts · ${format_duration(result.duration_ms)}`,
                    ]),
                    Show({
                      when: computed(
                        vm$.state.active_tab,
                        (tab) => tab === "network",
                      ),
                      ok() {
                        return Button(
                          {
                            store: vm$.ui.btn_copy_har$,
                            attributes: {
                              n: "browser-copy-har-button",
                              type: "button",
                              title: "复制脱敏后的 HAR 1.2 JSON",
                            },
                            prefix: Timeless.Icon({
                              name: "copy",
                              size: 14,
                              attributes: { n: "browser-copy-har-icon" },
                            }),
                          },
                          ["复制 HAR"],
                        );
                      },
                    }),
                  ],
                ),
              ],
            ),
            Show({
              when: computed(vm$.state.active_tab, (tab) => tab === "network"),
              ok() {
                return View({ attributes: { id: "browser-network-content" } }, [BrowserNetworkPanel({ result })]);
              },
            }),
            Show({
              when: computed(vm$.state.active_tab, (tab) => tab === "console"),
              ok() {
                return View({ attributes: { id: "browser-console-content" } }, [BrowserConsolePanel({ result })]);
              },
            }),
          ];
        },
      }),
      Show({
        when: computed(vm$.state.result, (result) => !result),
        ok() {
          return View({ class: "browser-devtools-empty", attributes: { n: "browser-devtools-empty" } }, [
            "Network 与 Console 将在导航完成后显示。",
          ]);
        },
      }),
    ],
  );
}

function BrowserPageView(props) {
  const vm$ = BrowserPageViewModel(props);
  return View(
    {
      class: "content-page browser-page page",
      attributes: { n: "browser-page" },
      onUnmounted() {
        vm$.methods.destroy();
      },
    },
    [
      View({ class: "content-main container browser-main" }, [
        View({ class: "browser-heading", attributes: { n: "browser-heading" } }, [
          View({}, [
            View({ class: "browser-title" }, ["Minib 浏览器"]),
            View({ class: "browser-description" }, ["检查导航后的 HTML、网络请求与前端输出。"]),
          ]),
        ]),
        BrowserAddressBar({ store: vm$ }),
        Show({
          when: vm$.state.error,
          ok() {
            return View(
              { class: "browser-error", attributes: { n: "browser-error", role: "alert" } },
              [Timeless.Icon({ name: "alert-circle", size: 16 }), vm$.state.error],
            );
          },
        }),
        BrowserHTMLPanel({ store: vm$ }),
        BrowserDevtools({ store: vm$ }),
      ]),
    ],
  );
}

export default BrowserPageView;
