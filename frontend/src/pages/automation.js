import {
  AutomationPageViewModel,
  calculate_flow_minimap_geometry,
  calculate_pipeline_node_positions,
} from "./automation.model.js";

function automation_trigger_badge(props) {
  const type = props.type || "Cron";
  const variants = {
    cron: "info",
    event: "success",
    manual: "warning",
  };
  const normalized = String(type).toLowerCase();
  return Tag(
    {
      variant: variants[normalized] || "default",
      class: "automation-trigger",
      attributes: { n: `automation-trigger-${normalized}` },
    },
    [props.label],
  );
}

function automation_status_badge(value) {
  const normalized = String(value || "UNKNOWN").toUpperCase();
  let tone = "info";
  if (["COMPLETED", "ENABLED", "TRUE", "YES"].includes(normalized)) {
    tone = "success";
  } else if (["FAILED", "FALSE", "NO", "CANCELLED"].includes(normalized)) {
    tone = "danger";
  } else if (["RUNNING", "WAITING", "QUEUED"].includes(normalized)) {
    tone = "warning";
  }
  return Tag(
    {
      variant: tone,
      class: "automation-status",
      attributes: { n: `automation-status-${normalized.toLowerCase()}` },
    },
    [normalized],
  );
}

function automation_activate(event, callback) {
  if (event.target !== event.currentTarget) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  callback();
}

function AutomationEmptyState(props = {}) {
  return View(
    {
      class: [
        "dm-empty-state automation-empty-state",
        props.compact ? "automation-empty-state--compact" : "",
        props.detail ? "automation-empty-state--detail" : "",
      ]
        .filter(Boolean)
        .join(" "),
      attributes: {
        n: props.name || "automation-empty-state",
        role: "status",
        "aria-live": "polite",
      },
    },
    [
      View({ class: "content-state-title" }, [props.title]),
      props.description
        ? View({ class: "content-state-text" }, [props.description])
        : null,
    ].filter(Boolean),
  );
}

function automation_pipeline_href(flow_id, mode) {
  const search = new URLSearchParams({
    mode,
    id: String(flow_id || ""),
  });
  return `/automation?${search.toString()}`;
}

function AutomationPipelineLink(props) {
  const mode = props.mode === "edit" ? "edit" : "detail";
  return Link(
    {
      class: [
        "dm-button dm-focus-ring dm-button--sm automation-open-link",
        props.primary ? "dm-button--primary" : "dm-button--outline",
      ].join(" "),
      href: automation_pipeline_href(props.flowId, mode),
      target: "_blank",
      attributes: {
        n: `automation-open-${mode}-${props.flowId}`,
        rel: "noopener noreferrer",
        "aria-label": `${props.label}（新标签页）`,
      },
    },
    [
      Timeless.Icon({
        name: mode === "edit" ? "pen-line" : "eye",
        size: 15,
        attributes: { "aria-hidden": "true" },
      }),
      props.label,
    ],
  );
}

function AutomationFeedback(props) {
  const vm$ = props.store;
  return View({ class: "automation-feedback container" }, [
    Show({
      when: vm$.state.error,
      ok() {
        return Alert(
          {
            variant: "destructive",
            class: "automation-alert",
            attributes: { n: "automation-error-alert" },
          },
          [
            AlertTitle({ attributes: { n: "automation-error-title" } }, [
              "请求失败",
            ]),
            AlertDescription({}, [vm$.state.error.value]),
          ],
        );
      },
    }),
    Show({
      when: vm$.state.notice,
      ok() {
        return Alert(
          {
            class: "automation-alert",
            attributes: { n: "automation-notice-alert" },
          },
          [AlertDescription({}, [vm$.state.notice.value])],
        );
      },
    }),
  ]);
}

function AutomationPageView(props) {
  const vm$ = AutomationPageViewModel(props);
  return View(
    {
      class: "content-page automation-page page",
      attributes: { n: "automation-page" },
      onMounted() {
        vm$.methods.ready();
      },
    beforeUnmounted() {
      vm$.methods.destroy();
    },
    },
    [
      Show({
        when: computed(vm$.state.view_mode, (mode) => mode === "list"),
        ok() {
          return AutomationListPage({ store: vm$ });
        },
      }),
      Show({
        when: computed(vm$.state.view_mode, (mode) => mode === "detail"),
        ok() {
          return AutomationDetailPage({ store: vm$ });
        },
      }),
      Show({
        when: computed(vm$.state.view_mode, (mode) => mode === "edit"),
        ok() {
          return AutomationEditorPage({ store: vm$ });
        },
      }),
      AutomationCreatePipelineDialog({ store: vm$ }),
      AutomationAddNodeDialog({ store: vm$ }),
      AutomationCreateScheduleDialog({ store: vm$ }),
      AutomationDeletePipelineConfirm({ store: vm$ }),
    ],
  );
}

function AutomationListPage(props) {
  const vm$ = props.store;
  return View({ class: "automation-list-page" }, [
    View({ class: "content-toolbar-wrap container" }, [
      AutomationPageToolbar({ store: vm$ }),
    ]),
    AutomationFeedback({ store: vm$ }),
    View({ class: "content-main container automation-index" }, [
      Show({
        when: computed(vm$.state.tab, (tab) => tab === "pipelines"),
        ok() {
          return AutomationPipelineList({ store: vm$ });
        },
      }),
      Show({
        when: computed(vm$.state.tab, (tab) => tab === "schedules"),
        ok() {
          return AutomationScheduleList({ store: vm$ });
        },
      }),
    ]),
  ]);
}

function AutomationPageToolbar(props) {
  const vm$ = props.store;
  return View({ class: "content-toolbar automation-toolbar" }, [
    View({ class: "dm-flex dm-items-center dm-gap-2" }, [
      View({ class: "automation-toolbar-title" }, ["自动化"]),
      Tab(
        {
          selected: computed(vm$.state.tab, (tab) => tab === "pipelines"),
          onClick() {
            vm$.methods.switchTab("pipelines");
          },
          attributes: { n: "automation-tab-pipelines" },
        },
        ["Pipeline"],
      ),
      Tab(
        {
          selected: computed(vm$.state.tab, (tab) => tab === "schedules"),
          onClick() {
            vm$.methods.switchTab("schedules");
          },
          attributes: { n: "automation-tab-schedules" },
        },
        ["自动化"],
      ),
    ]),
    View({ class: "dm-flex dm-items-center dm-gap-2" }, [
      Button(
        {
          store: vm$.ui.btn_refresh$,
          attributes: { n: "automation-refresh-button", type: "button" },
        },
        ["刷新"],
      ),
      Button(
        {
          store: vm$.ui.btn_create_pipeline$,
          attributes: { n: "automation-create-pipeline", type: "button" },
        },
        ["创建 Pipeline"],
      ),
    ]),
  ]);
}

function AutomationPageSide(props) {}

function AutomationPipelineList(props) {
  const vm$ = props.store;
  return View({ class: "automation-list" }, [
    For({
      each: vm$.state.pipelines,
      key: "id",
      render(pipeline_) {
        const pipeline =
          pipeline_ && pipeline_.value !== undefined
            ? pipeline_.value
            : pipeline_;
        return View(
          {
            class: "dm-list-card automation-card automation-pipeline-row",
            attributes: {
              n: `automation-pipeline-card-${pipeline.id}`,
            },
          },
          [
            View({ class: "automation-card__main" }, [
              View({ class: "automation-card__header" }, [
                View(
                  {
                    class: "automation-card__title",
                    attributes: { title: pipeline.name || pipeline.id },
                  },
                  [pipeline.name || pipeline.id],
                ),
                automation_trigger_badge({
                  type: pipeline.trigger_type,
                  label: vm$.methods.triggerLabel(pipeline.trigger_type),
                }),
              ]),
              View(
                {
                  class: "automation-card__subtitle",
                  attributes: { title: pipeline.id },
                },
                [pipeline.id],
              ),
              View({ class: "automation-card__description" }, [
                pipeline.description || "暂无描述",
              ]),
            ]),
            View({ class: "automation-card__stats" }, [
              View({ class: "automation-stat" }, [
                View({ class: "automation-stat__value" }, [
                  String((pipeline.nodes || []).length),
                ]),
                View({ class: "automation-stat__label" }, ["节点"]),
              ]),
              View({ class: "automation-stat" }, [
                View({ class: "automation-stat__value" }, [
                  String((pipeline.edges || []).length),
                ]),
                View({ class: "automation-stat__label" }, ["连线"]),
              ]),
              View({ class: "automation-stat automation-stat--time" }, [
                View({ class: "automation-stat__value" }, [
                  vm$.methods.formatTime(
                    pipeline.updated_at || pipeline.created_at,
                  ),
                ]),
                View({ class: "automation-stat__label" }, ["最后更新"]),
              ]),
            ]),
            View({ class: "automation-card__actions" }, [
              AutomationPipelineLink({
                flowId: pipeline.id,
                mode: "detail",
                label: "详情",
              }),
              AutomationPipelineLink({
                flowId: pipeline.id,
                mode: "edit",
                label: "编辑",
              }),
            ]),
          ],
        );
      },
    }),
    Show({
      when: computed(
        vm$.state.pipelines,
        (pipelines) => pipelines.length === 0,
      ),
      ok() {
        return AutomationEmptyState({
          compact: true,
          name: "automation-pipeline-list-empty",
          title: computed(vm$.state.loading, (loading) =>
            loading ? "正在加载 Pipeline…" : "暂无 Pipeline",
          ),
          description: computed(vm$.state.loading, (loading) =>
            loading
              ? "正在获取最新的流程配置。"
              : "点击右上角「创建 Pipeline」开始搭建流程。",
          ),
        });
      },
    }),
  ]);
}

function AutomationScheduleList(props) {
  const vm$ = props.store;
  return View({ class: "automation-list" }, [
    For({
      each: vm$.state.schedules,
      key: "id",
      render(schedule_) {
        const schedule =
          schedule_ && schedule_.value !== undefined
            ? schedule_.value
            : schedule_;
        const metadata = vm$.methods.scheduleMetadata(schedule);
        return View(
          {
            class:
              "dm-list-card automation-card automation-card--schedule automation-schedule-row",
            attributes: {
              n: `automation-schedule-card-${schedule.id}`,
            },
          },
          [
            View({ class: "automation-card__header" }, [
              View(
                {
                  class: "automation-card__title",
                  attributes: { title: schedule.name },
                },
                [schedule.name],
              ),
              View({ class: "automation-card__badges" }, [
                automation_trigger_badge({
                  type: metadata.type,
                  label: vm$.methods.triggerLabel(metadata.type),
                }),
                metadata.type === "Cron"
                  ? automation_status_badge(
                      schedule.enabled ? "ENABLED" : "DISABLED",
                    )
                  : null,
              ]),
            ]),
            View({ class: "automation-card__subtitle" }, [
              vm$.methods.pipelineName(schedule.flow_id),
            ]),
            View({ class: "automation-card__meta" }, [
              View({ class: "automation-card__code" }, [
                metadata.type === "Cron"
                  ? schedule.cron_expr
                  : metadata.event_key || metadata.start_node,
              ]),
              View({}, [
                metadata.type === "Cron"
                  ? `下次 ${vm$.methods.formatTime(schedule.next_run_at)}`
                  : `开始 ${metadata.start_node || "-"}`,
              ]),
            ]),
            View(
              {
                class: "automation-card__actions",
                onClick(event) {
                  event.stopPropagation();
                },
              },
              [
                metadata.type === "Cron"
                  ? Button(
                      {
                        store: vm$.ui.btn_schedule_toggle$.bind(schedule),
                        attributes: {
                          n: `automation-schedule-toggle-${schedule.id}`,
                          type: "button",
                        },
                      },
                      [schedule.enabled ? "暂停" : "启用"],
                    )
                  : null,
                Button(
                  {
                    store: vm$.ui.btn_schedule_trigger$.bind(schedule),
                    attributes: {
                      n: `automation-schedule-trigger-${schedule.id}`,
                      type: "button",
                    },
                  },
                  [metadata.type === "Event" ? "触发事件" : "手动执行"],
                ),
              ],
            ),
          ],
        );
      },
    }),
    Show({
      when: computed(
        vm$.state.schedules,
        (schedules) => schedules.length === 0,
      ),
      ok() {
        return AutomationEmptyState({
          compact: true,
          name: "automation-schedule-list-empty",
          title: computed(vm$.state.loading, (loading) =>
            loading ? "正在加载自动化…" : "暂无自动化流程",
          ),
          description: computed(vm$.state.loading, (loading) =>
            loading
              ? "正在获取最新的触发计划。"
              : "选择一个 Pipeline 后即可创建定时、事件或手动触发。",
          ),
        });
      },
    }),
  ]);
}

// function AutomationPageMain(props) {
//   const vm$ = props.store;
//   return ;
// }

function AutomationScheduleSummary(props) {
  const vm$ = props.store;
  const schedule_ = vm$.state.selected_schedule;
  return View(
    {
      class: "dm-panel automation-summary",
      attributes: { n: "automation-schedule-summary" },
    },
    [
      computed(schedule_, (schedule) => {
        if (!schedule) return null;
        const metadata = vm$.methods.scheduleMetadata(schedule);
        const pipeline = (vm$.state.pipelines.value || []).find(
          (item) => item.id === schedule.flow_id,
        );
        const rows = [
          ["流程名称", View({}, [schedule.name])],
          [
            "触发方式",
            automation_trigger_badge({
              type: metadata.type,
              label: vm$.methods.triggerLabel(metadata.type),
            }),
          ],
          [
            "开始节点",
            View({ class: "automation-code" }, [
              vm$.methods.effectiveStartNode(pipeline, schedule),
            ]),
          ],
          [
            "触发配置",
            View({ class: "automation-code" }, [
              metadata.type === "Cron"
                ? schedule.cron_expr
                : metadata.type === "Event"
                  ? metadata.event_key
                  : "manual",
            ]),
          ],
          [
            "下次执行",
            metadata.type === "Cron"
              ? vm$.methods.formatTime(schedule.next_run_at)
              : "由触发动作执行",
          ],
          [
            "状态",
            metadata.type === "Cron"
              ? automation_status_badge(
                  schedule.enabled ? "ENABLED" : "DISABLED",
                )
              : automation_trigger_badge({
                  type: metadata.type,
                  label: vm$.methods.triggerLabel(metadata.type),
                }),
          ],
        ];
        const children = rows.map(([label, value]) =>
          View({ class: "automation-summary__item" }, [
            View({ class: "automation-property__label" }, [label]),
            value,
          ]),
        );
        children.push(
          View({ class: "automation-summary__item is-wide" }, [
            View({ class: "automation-property__label" }, ["初始数据"]),
            View({ class: "automation-code automation-code--wrap" }, [
              schedule.initial_data || "{}",
            ]),
          ]),
        );
        return View({ class: "automation-summary__grid" }, children);
      }),
      View({ class: "automation-runs" }, [
        View({ class: "automation-section-title" }, ["执行记录"]),
        For({
          each: vm$.state.runs,
          key: "id",
          render(run_) {
            const run = run_ && run_.value !== undefined ? run_.value : run_;
            return View(
              {
                class: "dm-list-card automation-run",
                attributes: { n: `automation-run-${run.id}` },
              },
              [
                automation_status_badge(run.status),
                View({ class: "automation-run__main" }, [
                  View({ class: "automation-run__trigger" }, [
                    run.trigger_type || "Manual",
                  ]),
                  View({ class: "automation-run__time" }, [
                    vm$.methods.formatTime(run.started_at || run.created_at),
                  ]),
                ]),
                View({ class: "automation-run__node" }, [
                  run.current_node || "-",
                ]),
                View({ class: "automation-run__error" }, [run.error || ""]),
              ],
            );
          },
        }),
        Show({
          when: computed(vm$.state.runs, (runs) => runs.length === 0),
          ok() {
            return AutomationEmptyState({
              compact: true,
              name: "automation-runs-empty",
              title: "暂无执行记录",
              description: "执行 Pipeline 后，运行状态和错误信息会显示在这里。",
            });
          },
        }),
      ]),
    ],
  );
}

function AutomationWorkspaceToolbar(props) {
  const vm$ = props.store;
  const is_edit = props.mode === "edit";
  return View({ class: "content-toolbar automation-workspace-toolbar" }, [
    View({ class: "automation-workspace-toolbar__identity" }, [
      Link(
        {
          class:
            "dm-button dm-button--ghost dm-button--sm dm-focus-ring automation-back-link",
          href: "/automation",
          attributes: {
            n: "automation-back-to-list",
            "aria-label": "返回 Pipeline 列表",
          },
        },
        [
          Timeless.Icon({
            name: "arrow-left",
            size: 16,
            attributes: { "aria-hidden": "true" },
          }),
          "Pipeline 列表",
        ],
      ),
      View({ class: "automation-workspace-toolbar__divider" }),
      View({ class: "automation-workspace-toolbar__title-wrap" }, [
        View({ class: "automation-workspace-toolbar__eyebrow" }, [
          is_edit ? "编辑 Pipeline" : "Pipeline 详情",
        ]),
        View({ class: "automation-workspace-toolbar__title" }, [
          computed(vm$.state.selected_pipeline, (flow) =>
            flow ? flow.name || flow.id : vm$.state.selected_flow_id.value,
          ),
        ]),
      ]),
    ]),
    View(
      { class: "automation-workspace-toolbar__actions" },
      [
        is_edit
          ? Tag(
              {
                variant: "warning",
                class: computed(vm$.state.dirty, (dirty) =>
                  dirty
                    ? "automation-dirty-tag"
                    : "automation-dirty-tag is-clean",
                ),
              },
              [
                computed(vm$.state.dirty, (dirty) =>
                  dirty ? "有未保存变更" : "已保存",
                ),
              ],
            )
          : null,
        Button(
          {
            store: vm$.ui.btn_run_flow$,
            attributes: { n: "automation-run-flow", type: "button" },
          },
          ["立即执行"],
        ),
        !is_edit
          ? Button(
              {
                store: vm$.ui.btn_schedule_create$,
                attributes: {
                  n: "automation-create-schedule",
                  type: "button",
                },
              },
              ["创建自动化"],
            )
          : null,
        is_edit
          ? Button(
              {
                store: vm$.ui.btn_save_flow$,
                attributes: { n: "automation-save-flow", type: "button" },
              },
              ["保存 Pipeline"],
            )
          : AutomationPipelineLink({
              flowId: vm$.state.selected_flow_id.value,
              mode: "edit",
              label: "编辑 Pipeline",
              primary: true,
            }),
        is_edit
          ? Button(
              {
                store: vm$.ui.btn_delete_flow$,
                attributes: {
                  n: "automation-delete-flow",
                  type: "button",
                },
              },
              ["删除 Pipeline"],
            )
          : null,
      ].filter(Boolean),
    ),
  ]);
}

function AutomationDetailPage(props) {
  const vm$ = props.store;
  return View({ class: "automation-detail-page" }, [
    View({ class: "content-toolbar-wrap container" }, [
      AutomationWorkspaceToolbar({ store: vm$, mode: "detail" }),
    ]),
    AutomationFeedback({ store: vm$ }),
    View({ class: "content-main container" }, [
      Show({
        when: vm$.state.selected_pipeline,
        ok() {
          return AutomationPipelineDetail({ store: vm$ });
        },
      }),
      Show({
        when: computed(vm$.state.selected_pipeline, (flow) => !flow),
        ok() {
          return AutomationEmptyState({
            detail: true,
            name: "automation-pipeline-detail-empty",
            title: computed(vm$.state.loading, (loading) =>
              loading ? "正在加载 Pipeline…" : "未找到 Pipeline",
            ),
            description: computed(vm$.state.loading, (loading) =>
              loading
                ? "正在获取流程定义和节点信息。"
                : "请返回列表确认 Pipeline 是否仍然存在。",
            ),
          });
        },
      }),
    ]),
  ]);
}

function AutomationPipelineDetail(props) {
  const vm$ = props.store;
  return View({ class: "dm-panel automation-detail" }, [
    computed(vm$.state.selected_pipeline, (flow) => {
      if (!flow) return null;
      return [
        View({ class: "automation-detail__header" }, [
          View({}, [
            View({ class: "automation-detail__title" }, [flow.name || flow.id]),
            View(
              {
                class: "automation-detail__subtitle",
                attributes: { title: flow.id },
              },
              [flow.id],
            ),
          ]),
          automation_trigger_badge({
            type: flow.trigger_type,
            label: vm$.methods.triggerLabel(flow.trigger_type),
          }),
        ]),
        View({ class: "automation-detail__description" }, [
          flow.description || "暂无描述",
        ]),
        View({ class: "dm-panel dm-panel--soft automation-properties" }, [
          View({ class: "automation-summary__item" }, [
            View({ class: "automation-property__label" }, ["上下文 Schema"]),
            View({ class: "automation-code" }, [
              vm$.methods.schemaText(flow.context_schema),
            ]),
          ]),
          View({ class: "automation-summary__item" }, [
            View({ class: "automation-property__label" }, ["开始节点"]),
            View({ class: "automation-code" }, [flow.start_node_id]),
          ]),
          View({ class: "automation-summary__item" }, [
            View({ class: "automation-property__label" }, ["节点 / 连线"]),
            View({}, [
              `${(flow.nodes || []).length} / ${(flow.edges || []).length}`,
            ]),
          ]),
        ]),
        View({ class: "automation-section-title" }, ["流程结构"]),
        AutomationFlowGraph({ store: vm$, editable: false }),
      ];
    }),
  ]);
}

function AutomationNodeLibrary(props) {
  const vm$ = props.store;
  return View(
    {
      class: "dm-panel automation-node-library",
      attributes: { n: "automation-node-library" },
    },
    [
      View({ class: "automation-editor-panel__header" }, [
        View({}, [
          View({ class: "automation-editor-panel__title" }, ["节点库"]),
          View({ class: "automation-editor-panel__hint" }, [
            "添加到当前选中节点之后",
          ]),
        ]),
        Button(
          {
            store: vm$.ui.btn_add_node$,
            attributes: {
              n: "automation-add-node",
              type: "button",
              title: "选择并添加节点",
            },
          },
          ["添加"],
        ),
      ]),
      View({ class: "automation-node-library__list" }, [
        For({
          each: vm$.state.catalog,
          key: "type",
          render(item_) {
            const item =
              item_ && item_.value !== undefined ? item_.value : item_;
            return View(
              {
                as: "button",
                class:
                  "dm-button dm-button--list-row dm-focus-ring automation-node-library__item",
                attributes: {
                  n: `automation-node-library-${item.type}`,
                  type: "button",
                  title: `添加${item.name}`,
                },
                onClick() {
                  vm$.methods.openAddDialog(item.type);
                },
              },
              [
                View({ class: "dm-icon-box automation-node-library__icon" }, [
                  Timeless.Icon({
                    name: item.type === "GatewayNode" ? "git-branch" : "box",
                    size: 15,
                    attributes: { "aria-hidden": "true" },
                  }),
                ]),
                View({ class: "automation-node-library__copy" }, [
                  View({ class: "automation-node-library__name" }, [item.name]),
                  View({ class: "automation-node-library__description" }, [
                    item.description,
                  ]),
                ]),
                Timeless.Icon({
                  name: "plus",
                  size: 15,
                  attributes: { "aria-hidden": "true" },
                }),
              ],
            );
          },
        }),
      ]),
    ],
  );
}

function AutomationNodeInspector(props) {
  const vm$ = props.store;
  return View(
    {
      class: "dm-panel automation-node-inspector",
      attributes: { n: "automation-node-inspector" },
    },
    [
      View({ class: "automation-editor-panel__header" }, [
        View({}, [
          View({ class: "automation-editor-panel__title" }, ["节点配置"]),
          View({ class: "automation-editor-panel__hint" }, [
            "修改当前选中节点",
          ]),
        ]),
      ]),
      (() => {
        // const node = (vm$.state.edit_nodes.value || []).find(
        //   (item) => item.id === selected_id,
        // );
        const node = computed(
          vm$.state.selected_edit_node_id,
          (selected_id) => {
            return (vm$.state.edit_nodes.value || []).find(
              (item) => item.id === selected_id,
            );
          },
        );
        return Show({
          when: computed(node, (t) => !t),
          ok() {
            return AutomationEmptyState({
              compact: true,
              name: "automation-node-inspector-empty",
              title: "请选择节点",
              description: "在画布中选择节点后编辑配置。",
            });
          },
          else() {
            const is_start = node.id === vm$.state.edit_start_node_id.value;
            return View(
              { class: "automation-inspector-form" },
              [
                View({ class: "automation-inspector-meta" }, [
                  Tag({ variant: is_start ? "success" : "info" }, [
                    vm$.methods.flowLabel(node.type),
                  ]),
                  View(
                    {
                      class: "automation-code",
                      attributes: { title: node.id },
                    },
                    [node.id],
                  ),
                ]),
                View({ class: "automation-form__field" }, [
                  Label({ class: "automation-form__label" }, ["节点名称"]),
                  Input({
                    store: vm$.ui.input_edit_node_name$,
                    attributes: {
                      n: "automation-edit-node-name",
                      "aria-label": "节点名称",
                    },
                  }),
                ]),
                View({ class: "automation-form__field" }, [
                  Label({ class: "automation-form__label" }, ["节点配置 JSON"]),
                  Textarea({
                    store: vm$.ui.input_edit_node_config$,
                    class: "automation-node-config-input",
                    attributes: {
                      n: "automation-edit-node-config",
                      rows: "12",
                      spellcheck: "false",
                      "aria-label": "节点配置 JSON",
                    },
                  }),
                ]),
                Button(
                  {
                    store: vm$.ui.btn_apply_node_config$,
                    attributes: {
                      n: "automation-apply-node-config",
                      type: "button",
                    },
                  },
                  ["应用节点配置"],
                ),
                View({ class: "automation-inspector-connections" }, [
                  View({ class: "automation-property__label" }, ["后续节点"]),
                  View({ class: "automation-code automation-code--wrap" }, [
                    (node.next_ids || []).join("、") || "无",
                  ]),
                ]),
                !is_start
                  ? Button(
                      {
                        store: vm$.ui.btn_remove_selected_node$,
                        class: "automation-remove-selected-node",
                        attributes: {
                          n: "automation-remove-selected-node",
                          type: "button",
                        },
                      },
                      ["删除当前节点"],
                    )
                  : null,
              ].filter(Boolean),
            );
          },
        });
      })(),
    ],
  );
}

function AutomationEditorPage(props) {
  const vm$ = props.store;
  return View({ class: "automation-editor-page" }, [
    View({ class: "content-toolbar-wrap automation-editor-toolbar-wrap" }, [
      AutomationWorkspaceToolbar({ store: vm$, mode: "edit" }),
    ]),
    AutomationFeedback({ store: vm$ }),
    Show({
      when: vm$.state.selected_pipeline,
      ok() {
        return View(
          {
            class: "automation-editor-workspace",
            attributes: { n: "automation-editor-workspace" },
          },
          [
            AutomationNodeLibrary({ store: vm$ }),
            View({ class: "automation-editor-canvas" }, [
              View({ class: "automation-editor-canvas__header" }, [
                View({}, [
                  View({ class: "automation-editor-panel__title" }, [
                    "工作流画布",
                  ]),
                  View({ class: "automation-editor-panel__hint" }, [
                    computed(
                      vm$.state.edit_nodes,
                      (nodes) => `${nodes.length} 个节点 · 点击节点编辑配置`,
                    ),
                  ]),
                ]),
              ]),
              AutomationFlowGraph({ store: vm$, editable: true }),
          AutomationExecutionPanel({ store: vm$ }),
            ]),
            AutomationNodeInspector({ store: vm$ }),
          ],
        );
      },
    }),
    Show({
      when: computed(vm$.state.selected_pipeline, (flow) => !flow),
      ok() {
        return View({ class: "container" }, [
          AutomationEmptyState({
            detail: true,
            name: "automation-pipeline-editor-empty",
            title: computed(vm$.state.loading, (loading) =>
              loading ? "正在加载编辑器…" : "无法打开 Pipeline",
            ),
            description: computed(vm$.state.loading, (loading) =>
              loading
                ? "正在准备节点库和流程定义。"
                : "请返回列表确认 Pipeline 是否仍然存在。",
            ),
          }),
        ]);
      },
    }),
  ]);
}

function automation_execution_status_class(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");
}

function AutomationExecutionPanel(props) {
  const vm$ = props.store;
  const recent_logs_ = computed(vm$.state.execution_logs, (logs) =>
    (logs || []).slice(-50).reverse(),
  );
  return View(
    {
      class: "automation-execution-panel",
      attributes: {
        n: "automation-execution-panel",
        "aria-label": "执行过程日志",
      },
    },
    [
      View({ class: "automation-execution-panel__header" }, [
        View({}, [
          View({ class: "automation-editor-panel__title" }, ["执行过程"]),
          View({ class: "automation-editor-panel__hint" }, [
            computed(
              vm$.state.execution_run_id,
              (run_id) => (run_id ? `Run ID：${run_id}` : "等待触发 Pipeline"),
            ),
          ]),
        ]),
        View(
          {
            class: combine(
              {
                connected: vm$.state.execution_channel_connected,
                status: vm$.state.execution_run_status,
              },
              ({ connected, status }) =>
                `automation-execution-connection${
                  connected ? " is-connected" : ""
                }${status ? ` is-${automation_execution_status_class(status)}` : ""}`,
            ),
            attributes: { role: "status", "aria-live": "polite" },
          },
          [
            View({ class: "automation-execution-connection__dot" }),
            computed(
              combine(
                {
                  connected: vm$.state.execution_channel_connected,
                  status: vm$.state.execution_run_status,
                },
                (value) => value,
              ),
              ({ connected, status }) =>
                status || (connected ? "实时连接" : "连接中"),
            ),
          ],
        ),
      ]),
      View(
        {
          class: "automation-execution-log-list",
          attributes: { "aria-live": "polite", "aria-relevant": "additions" },
        },
        [
          Show({
            when: computed(recent_logs_, (logs) => logs.length === 0),
            ok() {
              return View({ class: "automation-execution-log-empty" }, [
                "触发 Pipeline 后，这里会实时显示每个节点的入参、行为和输出。",
              ]);
            },
          }),
          For({
            each: recent_logs_,
            key: "_execution_key",
            render(entry_) {
              const entry =
                entry_ && entry_.value !== undefined ? entry_.value : entry_;
              return View(
                {
                  as: "details",
                  class: "automation-execution-log",
                  attributes: {
                    n: `automation-execution-log-${entry.node_id}`,
                  },
                },
                [
                  View(
                    {
                      as: "summary",
                      class: "automation-execution-log__summary dm-focus-ring",
                    },
                    [
                      View({ class: "automation-execution-log__node" }, [
                        entry.node_name || entry.node_id,
                      ]),
                      View(
                        {
                          class: `automation-execution-log__status is-${automation_execution_status_class(
                            entry.outcome,
                          )}`,
                        },
                        [vm$.methods.nodeExecutionStatusLabel(entry.outcome)],
                      ),
                      View({ class: "automation-execution-log__meta" }, [
                        `第 ${entry.attempt || 1} 次 · ${entry.duration_ms || 0} ms`,
                      ]),
                    ],
                  ),
                  View({ class: "automation-execution-log__body" }, [
                    ...[
                      ["入参", entry.input],
                      ["节点行为", entry.behavior],
                      ["输出", entry.output],
                    ].map(([label, value]) =>
                      View({ class: "automation-execution-log__data" }, [
                        View({ class: "automation-execution-log__label" }, [label]),
                        View(
                          {
                            as: "pre",
                            class: "automation-execution-log__value",
                          },
                          [vm$.methods.formatExecutionValue(value)],
                        ),
                      ]),
                    ),
                    entry.error
                      ? View({ class: "automation-execution-log__error" }, [entry.error])
                      : null,
                  ].filter(Boolean),
                ),
              ],
            );
            },
          }),
        ],
      ),
    ],
  );
}

function automation_edit_layout(nodes, position_overrides) {
  const by_id = {};
  (nodes || []).forEach((node) => {
    by_id[node.id] = node;
  });
  const positions = Object.fromEntries(
    Object.entries(calculate_pipeline_node_positions(nodes)).map(
      ([node_id, position]) => [node_id, { left: position.x, top: position.y }],
    ),
  );
  Object.entries(position_overrides || {}).forEach(([node_id, position]) => {
    if (!by_id[node_id] || !position) return;
    positions[node_id] = {
      left: Math.max(16, Number(position.left) || 0),
      top: Math.max(16, Number(position.top) || 0),
    };
  });
  const width = Object.values(positions).reduce(
    (max, position) => Math.max(max, position.left + 270),
    350,
  );
  const max_bottom = Object.values(positions).reduce(
    (max, position) => Math.max(max, position.top + 110),
    160,
  );
  return { positions, width, height: Math.max(max_bottom + 40, 320) };
}

function automation_edit_edges(nodes) {
  const edges = [];
  (nodes || []).forEach((node) => {
    (node.next_ids || []).forEach((target, index) => {
      edges.push({
        id: `${node.id}-${target}-${index}`,
        from: node.id,
        to: target,
      });
    });
  });
  return edges;
}

function automation_edge_path(edge, positions) {
  const from = positions[edge.from];
  const to = positions[edge.to];
  if (!from || !to) return "";
  const x1 = from.left + 180;
  const y1 = from.top + 52;
  const x2 = to.left;
  const y2 = to.top + 52;
  const middle = Math.max(36, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + middle} ${y1}, ${x2 - middle} ${y2}, ${x2} ${y2}`;
}

function automation_refresh_flow_canvas(canvas, nodes, position_overrides) {
  if (!canvas) return;
  const layout = automation_edit_layout(nodes, position_overrides);
  canvas.style.width = `${layout.width}px`;
  canvas.style.height = `${layout.height}px`;
  canvas.querySelectorAll(".automation-flow-edge").forEach((path) => {
    const edge = {
      from: path.getAttribute("data-flow-from"),
      to: path.getAttribute("data-flow-to"),
    };
    path.setAttribute("d", automation_edge_path(edge, layout.positions));
  });
}

const automation_flow_min_zoom = 0.25;
const automation_flow_max_zoom = 2;
const automation_flow_grid_size = 22;
const automation_flow_minimap_size = {
  width: 176,
  height: 112,
  padding: 8,
};

function AutomationFlowGraph(props) {
  const vm$ = props.store;
  const editable = Boolean(props.editable);
  const FlowPrimitive = Timeless.ui.FlowPrimitive;
  const flow$ = new Timeless.vm.FlowCanvasModel({
    nodes: [],
    edges: [],
    nodesDraggable: editable,
    nodesConnectable: false,
    multiSelect: false,
    minZoom: automation_flow_min_zoom,
    maxZoom: automation_flow_max_zoom,
  });
  const position_overrides = {};
  const flow_node_models = new Map();
  const viewport_ = refobj({ ...flow$.viewport });
  const minimap_geometry_ = refobj(
    calculate_flow_minimap_geometry(
      { width: 350, height: 320 },
      { width: 350, height: 320 },
      flow$.viewport,
      automation_flow_minimap_size,
    ),
  );
  const flow_edges_ = refarr(
    automation_edit_edges(vm$.state.edit_nodes.value || []),
  );
  let root_element = null;
  let canvas_element = null;
  let resize_observer = null;
  let active_pointer_cleanup = null;
  let wheel_handler = null;
  const stop_edge_sync = vm$.state.edit_nodes.subscribe({
    onChange(nodes) {
      flow_edges_.as(automation_edit_edges(nodes), { reset: true });
      refresh_minimap(nodes);
    },
  });
  const stop_viewport_sync = flow$.onViewportChange((viewport) => {
    viewport_.as({ ...viewport });
    refresh_minimap();
  });

  function viewport_size() {
    return {
      width: Math.max(1, root_element ? root_element.clientWidth : 1),
      height: Math.max(1, root_element ? root_element.clientHeight : 1),
    };
  }

  function refresh_minimap(nodes = vm$.state.edit_nodes.value) {
    const layout = automation_edit_layout(nodes, position_overrides);
    const size = viewport_size();
    const zoom = Math.max(automation_flow_min_zoom, flow$.viewport.zoom || 1);
    if (canvas_element) {
      canvas_element.style.width = `${Math.max(
        layout.width,
        size.width / zoom,
      )}px`;
      canvas_element.style.height = `${Math.max(
        layout.height,
        size.height / zoom,
      )}px`;
    }
    minimap_geometry_.as(
      calculate_flow_minimap_geometry(
        layout,
        size,
        flow$.viewport,
        automation_flow_minimap_size,
      ),
    );
  }

  function set_flow_zoom(next_zoom, anchor) {
    const viewport = flow$.viewport;
    const old_zoom = Math.max(automation_flow_min_zoom, viewport.zoom || 1);
    const zoom = Math.min(
      automation_flow_max_zoom,
      Math.max(automation_flow_min_zoom, next_zoom),
    );
    const size = viewport_size();
    const point = anchor || {
      x: size.width / 2,
      y: size.height / 2,
    };
    const world_x = (point.x - viewport.x) / old_zoom;
    const world_y = (point.y - viewport.y) / old_zoom;
    flow$.setViewport({
      x: point.x - world_x * zoom,
      y: point.y - world_y * zoom,
      zoom,
    });
  }

  function fit_flow_to_view() {
    const nodes = vm$.state.edit_nodes.value || [];
    if (nodes.length === 0) {
      flow$.resetView();
      return;
    }
    const layout = automation_edit_layout(nodes, position_overrides);
    const bounds = Object.values(layout.positions).reduce(
      (result, position) => ({
        min_x: Math.min(result.min_x, position.left),
        min_y: Math.min(result.min_y, position.top),
        max_x: Math.max(result.max_x, position.left + 180),
        max_y: Math.max(result.max_y, position.top + 104),
      }),
      {
        min_x: Infinity,
        min_y: Infinity,
        max_x: -Infinity,
        max_y: -Infinity,
      },
    );
    const size = viewport_size();
    const padding = 48;
    const content_width = Math.max(1, bounds.max_x - bounds.min_x);
    const content_height = Math.max(1, bounds.max_y - bounds.min_y);
    const zoom = Math.min(
      1,
      automation_flow_max_zoom,
      Math.max(
        automation_flow_min_zoom,
        Math.min(
          (size.width - padding * 2) / content_width,
          (size.height - padding * 2) / content_height,
        ),
      ),
    );
    flow$.setViewport({
      x: (size.width - content_width * zoom) / 2 - bounds.min_x * zoom,
      y: (size.height - content_height * zoom) / 2 - bounds.min_y * zoom,
      zoom,
    });
  }

  function ensure_flow_node(node, position) {
    let flow_node = flow_node_models.get(node.id);
    if (!flow_node) {
      flow_node = new Timeless.vm.FlowNodeModel({
        id: node.id,
        type: node.type,
        position: { x: position.left, y: position.top },
        width: 180,
        height: 104,
        data: node,
      });
      flow_node.setCanvas$(flow$);
      flow$.addNode(flow_node);
      flow_node_models.set(node.id, flow_node);
    } else {
      flow_node.type = node.type;
      flow_node.data = node;
      if (!position_overrides[node.id]) {
        flow_node.position = { x: position.left, y: position.top };
      }
    }
    return flow_node;
  }

  function reconcile_flow_nodes(nodes) {
    const active_ids = new Set((nodes || []).map((node) => node.id));
    flow_node_models.forEach((flow_node, node_id) => {
      if (active_ids.has(node_id)) return;
      flow_node_models.delete(node_id);
      delete position_overrides[node_id];
      flow$.removeNode(node_id);
    });
    return automation_edit_layout(nodes, position_overrides);
  }

  function stop_active_pointer() {
    if (!active_pointer_cleanup) return;
    const cleanup = active_pointer_cleanup;
    active_pointer_cleanup = null;
    cleanup();
  }

  function start_canvas_pan(event) {
    if (event.button !== 0) return;
    const target = event.target;
    if (
      target &&
      typeof target.closest === "function" &&
      target.closest(
        ".automation-flow-node-shell, .automation-flow-controls, .automation-flow-minimap",
      )
    ) {
      return;
    }
    event.preventDefault();
    stop_active_pointer();
    const start_x = event.clientX - flow$.viewport.x;
    const start_y = event.clientY - flow$.viewport.y;
    if (root_element) root_element.classList.add("is-panning");

    const handle_move = (move_event) => {
      flow$.setViewport({
        x: move_event.clientX - start_x,
        y: move_event.clientY - start_y,
      });
    };
    const handle_up = () => stop_active_pointer();
    active_pointer_cleanup = () => {
      document.removeEventListener("mousemove", handle_move);
      document.removeEventListener("mouseup", handle_up);
      if (root_element) root_element.classList.remove("is-panning");
    };
    document.addEventListener("mousemove", handle_move);
    document.addEventListener("mouseup", handle_up);
  }

  function move_viewport_from_minimap(event, minimap_element) {
    const geometry = minimap_geometry_.value;
    if (!geometry || geometry.scale <= 0) return;
    const rect = minimap_element.getBoundingClientRect();
    const local_x = Math.min(
      geometry.offset_x + geometry.world_width * geometry.scale,
      Math.max(geometry.offset_x, event.clientX - rect.left),
    );
    const local_y = Math.min(
      geometry.offset_y + geometry.world_height * geometry.scale,
      Math.max(geometry.offset_y, event.clientY - rect.top),
    );
    const world_x = (local_x - geometry.offset_x) / geometry.scale;
    const world_y = (local_y - geometry.offset_y) / geometry.scale;
    const size = viewport_size();
    flow$.setViewport({
      x: size.width / 2 - world_x * flow$.viewport.zoom,
      y: size.height / 2 - world_y * flow$.viewport.zoom,
    });
  }

  function start_minimap_drag(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    stop_active_pointer();
    const minimap_element = event.currentTarget;
    move_viewport_from_minimap(event, minimap_element);

    const handle_move = (move_event) => {
      move_viewport_from_minimap(move_event, minimap_element);
    };
    const handle_up = () => stop_active_pointer();
    active_pointer_cleanup = () => {
      document.removeEventListener("mousemove", handle_move);
      document.removeEventListener("mouseup", handle_up);
    };
    document.addEventListener("mousemove", handle_move);
    document.addEventListener("mouseup", handle_up);
  }

  function handle_minimap_keydown(event) {
    const amount = event.shiftKey ? 120 : 48;
    const viewport = flow$.viewport;
    const movement = {
      ArrowLeft: { x: viewport.x + amount },
      ArrowRight: { x: viewport.x - amount },
      ArrowUp: { y: viewport.y + amount },
      ArrowDown: { y: viewport.y - amount },
    }[event.key];
    if (movement) {
      event.preventDefault();
      flow$.setViewport(movement);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      fit_flow_to_view();
    }
  }

  function handle_canvas_wheel(event) {
    event.preventDefault();
    if (!root_element) return;
    const rect = root_element.getBoundingClientRect();
    const sensitivity = event.ctrlKey ? 0.01 : 0.001;
    const factor = Math.max(0.5, 1 - event.deltaY * sensitivity);
    set_flow_zoom(flow$.viewport.zoom * factor, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }

  function start_node_drag(event, node, flow_node) {
    if (!editable || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    vm$.methods.selectEditNode(node.id);

    const node_element = event.currentTarget;
    const shell_element = node_element.closest(".automation-flow-node-shell");
    const canvas_element = node_element.closest(".automation-flow-canvas");
    if (!shell_element || !canvas_element) return;

    stop_active_pointer();
    flow_node.pointerDown(event.clientX, event.clientY);
    shell_element.classList.add("is-dragging");
    let has_moved = false;

    const handle_move = (move_event) => {
      flow_node.pointerMove(move_event.clientX, move_event.clientY);
      const position = {
        left: Math.max(16, flow_node.position.x),
        top: Math.max(16, flow_node.position.y),
      };
      has_moved = true;
      flow_node.position = { x: position.left, y: position.top };
      position_overrides[node.id] = position;
      vm$.methods.stageEditNodePosition(node.id, {
        x: position.left,
        y: position.top,
      });
      shell_element.style.left = `${position.left}px`;
      shell_element.style.top = `${position.top}px`;
      automation_refresh_flow_canvas(
        canvas_element,
        vm$.state.edit_nodes.value,
        position_overrides,
      );
      refresh_minimap();
    };

    const handle_up = (up_event) => {
      flow_node.pointerUp(up_event.clientX, up_event.clientY);
      if (has_moved) {
        vm$.methods.moveEditNode(node.id, {
          x: flow_node.position.x,
          y: flow_node.position.y,
        });
      }
      stop_active_pointer();
    };

    active_pointer_cleanup = () => {
      document.removeEventListener("mousemove", handle_move);
      document.removeEventListener("mouseup", handle_up);
      shell_element.classList.remove("is-dragging");
    };
    document.addEventListener("mousemove", handle_move);
    document.addEventListener("mouseup", handle_up);
  }

  function flow_control_button(options) {
    return View(
      {
        as: "button",
        class:
          "dm-button dm-button--surface dm-button--icon dm-focus-ring automation-flow-control",
        attributes: {
          type: "button",
          title: options.label,
          "aria-label": options.label,
        },
        onMouseDown(event) {
          event.stopPropagation();
        },
        onClick(event) {
          event.stopPropagation();
          options.action();
        },
      },
      [
        Timeless.Icon({
          name: options.icon,
          size: 16,
          attributes: { "aria-hidden": "true" },
        }),
      ],
    );
  }

  function minimap_node_style(node) {
    return computed(minimap_geometry_, (geometry) => {
      const layout = automation_edit_layout(
        vm$.state.edit_nodes.value,
        position_overrides,
      );
      const position = layout.positions[node.id] || { left: 0, top: 0 };
      return {
        left: `${geometry.offset_x + position.left * geometry.scale}px`,
        top: `${geometry.offset_y + position.top * geometry.scale}px`,
        width: `${Math.max(4, 180 * geometry.scale)}px`,
        height: `${Math.max(4, 104 * geometry.scale)}px`,
      };
    });
  }

  function minimap_viewport_style() {
    return computed(minimap_geometry_, (geometry) => ({
      left: `${geometry.viewport.left}px`,
      top: `${geometry.viewport.top}px`,
      width: `${geometry.viewport.width}px`,
      height: `${geometry.viewport.height}px`,
    }));
  }

  return FlowPrimitive.Root(
    {
      store: flow$,
      class: [
        "dm-panel dm-panel--soft automation-flow-scroll",
        editable ? "is-editable" : "is-readonly",
      ].join(" "),
      attributes: {
        n: "automation-flow",
        "aria-label": "流程画布",
      },
      onMounted(event) {
        root_element = event.target.get$elm();
        wheel_handler = handle_canvas_wheel;
        root_element.addEventListener("wheel", wheel_handler, {
          passive: false,
        });
        if (typeof ResizeObserver !== "undefined") {
          resize_observer = new ResizeObserver(() => refresh_minimap());
          resize_observer.observe(root_element);
        }
        refresh_minimap();
      },
      onMouseDown(event) {
        start_canvas_pan(event);
      },
      beforeUnmounted() {
        stop_active_pointer();
        if (resize_observer) resize_observer.disconnect();
        if (root_element && wheel_handler) {
          root_element.removeEventListener("wheel", wheel_handler);
        }
        stop_edge_sync();
        stop_viewport_sync();
      },
    },
    [
      FlowPrimitive.Background({
        class: "automation-flow-background",
        style: computed(viewport_, (viewport) => {
          const zoom = Math.max(automation_flow_min_zoom, viewport.zoom || 1);
          const grid_size = automation_flow_grid_size * zoom;
          return {
            "background-position": `${viewport.x}px ${viewport.y}px`,
            "background-size": `${grid_size}px ${grid_size}px`,
          };
        }),
        attributes: {
          n: "automation-flow-background",
          "aria-hidden": "true",
        },
      }),
      FlowPrimitive.Canvas(
        {
          store: flow$,
          class: "automation-flow-canvas",
          style: combine(
            {
              nodes: vm$.state.edit_nodes,
              minimap: minimap_geometry_,
              viewport: viewport_,
            },
            ({ nodes, viewport }) => {
              const layout = reconcile_flow_nodes(nodes);
              const size = viewport_size();
              const zoom = Math.max(
                automation_flow_min_zoom,
                viewport.zoom || 1,
              );
              return {
                width: `${Math.max(layout.width, size.width / zoom)}px`,
                height: `${Math.max(layout.height, size.height / zoom)}px`,
                transform:
                  `translate(${viewport.x}px, ${viewport.y}px) ` +
                  `scale(${zoom})`,
                "transform-origin": "0 0",
              };
            },
          ),
          onMounted(event) {
            canvas_element = event.target.get$elm();
            refresh_minimap();
          },
        },
        [
          FlowPrimitive.EdgeLayer({ class: "automation-flow-edge-layer" }, [
            For({
              each: flow_edges_,
              key: "id",
              render(edge) {
                const path_ = computed(vm$.state.edit_nodes, (nodes) => {
                  const layout = automation_edit_layout(
                    nodes,
                    position_overrides,
                  );
                  return automation_edge_path(edge, layout.positions);
                });
                return SVG.SVG(
                  {
                    class: "automation-flow-edges",
                    width: "100%",
                    height: "100%",
                    xmlns: "http://www.w3.org/2000/svg",
                    "aria-hidden": "true",
                  },
                  [
                    SVG.Path({
                      class: "automation-flow-edge",
                      d: path_,
                      stroke: "currentColor",
                      "stroke-width": "2",
                      "stroke-linecap": "round",
                      fill: "none",
                      dataset: {
                        "flow-from": edge.from,
                        "flow-to": edge.to,
                      },
                    }),
                  ],
                );
              },
            }),
          ]),
          For({
            each: vm$.state.edit_nodes,
            key: "id",
            render(node_) {
              const node =
                node_ && node_.value !== undefined ? node_.value : node_;
              const layout = automation_edit_layout(
                vm$.state.edit_nodes.value,
                position_overrides,
              );
              const position = layout.positions[node.id] || {
                left: 20,
                top: 20,
              };
              const is_start =
                node.id === vm$.state.edit_start_node_id.value ||
                node.type === "StartNode";
              const selected = computed(
                vm$.state.selected_edit_node_id,
                (node_id) => editable && node_id === node.id,
              );
              const execution_status = computed(
                vm$.state.node_execution_states,
                (states) => (states && states[node.id]) || null,
              );
              const flow_node = ensure_flow_node(node, position);
              return FlowPrimitive.Node(
                {
                  store: flow$,
                  nodeId: node.id,
                  class: "automation-flow-node-shell",
                  style: {
                    left: `${position.left}px`,
                    top: `${position.top}px`,
                  },
                },
                [
                  View(
                    {
                    class: combine(
                      { selected, execution_status },
                      ({ selected: is_selected, execution_status: status }) =>
                          `dm-panel automation-flow-node${
                            is_start ? " is-start" : ""
                        }${is_selected ? " is-selected" : ""}${
                          status
                            ? ` has-execution is-${automation_execution_status_class(status.status)}`
                            : ""
                        }`,
                      ),
                      attributes: {
                        n: `automation-flow-node-${node.id}`,
                        title: node.name || node.id,
                        role: editable ? "button" : undefined,
                        tabindex: editable ? "0" : undefined,
                        "aria-pressed": computed(selected, (is_selected) =>
                          editable ? String(is_selected) : undefined,
                        ),
                      },
                      onMouseDown(event) {
                        start_node_drag(event, node, flow_node);
                      },
                      onClick() {
                        if (editable) vm$.methods.selectEditNode(node.id);
                      },
                      onKeyDown(event) {
                        if (!editable) return;
                        automation_activate(event, () =>
                          vm$.methods.selectEditNode(node.id),
                        );
                      },
                    },
                    [
                      View({ class: "automation-flow-node__header" }, [
                        View({ class: "automation-flow-node__name" }, [
                          node.name || node.id,
                        ]),
                        Tag(
                          {
                            variant: is_start ? "success" : "info",
                            class: "automation-flow-node__type",
                          },
                          [vm$.methods.flowLabel(node.type)],
                        ),
                      ]),
                      View({ class: "automation-flow-node__id" }, [node.id]),
                      Show({
                        when:
                          node.config && Object.keys(node.config).length > 0,
                        ok() {
                          const config_text = JSON.stringify(node.config);
                          return View(
                            {
                              class: "automation-flow-node__schema",
                              attributes: { title: config_text },
                            },
                            [config_text],
                          );
                        },
                      }),
                    Show({
                      when: execution_status,
                      ok() {
                        return View(
                          {
                            class: computed(
                              execution_status,
                              (status) =>
                                `automation-flow-node__execution is-${automation_execution_status_class(status.status)}`,
                            ),
                            attributes: { role: "status" },
                          },
                          [
                            computed(execution_status, (status) =>
                              vm$.methods.nodeExecutionStatusLabel(status.status),
                            ),
                          ],
                        );
                      },
                    }),
                    ],
                  ),
                  editable
                    ? View(
                        {
                          as: "button",
                          class:
                            "dm-button dm-button--outline dm-button--icon dm-focus-ring automation-flow-node__add-next",
                          attributes: {
                            n: `automation-flow-add-next-${node.id}`,
                            type: "button",
                            title: `在「${node.name || node.id}」后新增节点`,
                            "aria-label": `在「${node.name || node.id}」后新增节点`,
                            "aria-haspopup": "dialog",
                          },
                          onClick(event) {
                            event.stopPropagation();
                            vm$.methods.openAddDialog("", node.id);
                          },
                        },
                        [
                          Timeless.Icon({
                            name: "plus",
                            size: 16,
                            attributes: { "aria-hidden": "true" },
                          }),
                        ],
                      )
                    : null,
                ],
              );
            },
          }),
        ],
      ),
      FlowPrimitive.Controls(
        {
          store: flow$,
          class: "dm-panel automation-flow-controls",
          attributes: {
            n: "automation-flow-controls",
            "aria-label": "画布缩放控制",
            role: "group",
          },
          onMouseDown(event) {
            event.stopPropagation();
          },
        },
        [
          flow_control_button({
            icon: "plus",
            label: "放大画布",
            action() {
              set_flow_zoom(flow$.viewport.zoom + 0.1);
            },
          }),
          View(
            {
              class: "automation-flow-controls__zoom",
              attributes: { "aria-live": "polite" },
            },
            [
              computed(
                minimap_geometry_,
                () => `${Math.round(flow$.viewport.zoom * 100)}%`,
              ),
            ],
          ),
          flow_control_button({
            icon: "minus",
            label: "缩小画布",
            action() {
              set_flow_zoom(flow$.viewport.zoom - 0.1);
            },
          }),
          flow_control_button({
            icon: "maximize",
            label: "适应全部节点",
            action: fit_flow_to_view,
          }),
          flow_control_button({
            icon: "rotate-ccw",
            label: "重置画布视图",
            action() {
              flow$.resetView();
            },
          }),
        ],
      ),
      FlowPrimitive.Minimap(
        {
          store: flow$,
          class: "dm-panel automation-flow-minimap dm-focus-ring",
          attributes: {
            n: "automation-flow-minimap",
            role: "button",
            tabindex: "0",
            title: "点击或拖动定位画布；方向键移动视图",
            "aria-label": "流程缩略图，点击或拖动定位，方向键移动视图",
          },
          onMouseDown(event) {
            start_minimap_drag(event);
          },
          onClick(event) {
            event.stopPropagation();
          },
          onKeyDown(event) {
            handle_minimap_keydown(event);
          },
        },
        [
          View({ class: "automation-flow-minimap__nodes" }, [
            For({
              each: vm$.state.edit_nodes,
              key: "id",
              render(node_) {
                const node =
                  node_ && node_.value !== undefined ? node_.value : node_;
                const selected = computed(
                  vm$.state.selected_edit_node_id,
                  (node_id) => editable && node_id === node.id,
                );
                const execution_status = computed(
                  vm$.state.node_execution_states,
                  (states) => (states && states[node.id]) || null,
                );
                return View({
                  class: combine(
                    { selected, execution_status },
                    ({ selected: is_selected, execution_status: status }) =>
                      `automation-flow-minimap__node${
                        node.type === "StartNode" ? " is-start" : ""
                      }${is_selected ? " is-selected" : ""}${
                        status
                          ? ` has-execution is-${automation_execution_status_class(status.status)}`
                          : ""
                      }`,
                  ),
                  style: minimap_node_style(node),
                  attributes: { "aria-hidden": "true" },
                });
              },
            }),
          ]),
          View({
            class: "automation-flow-minimap__viewport",
            style: minimap_viewport_style(),
            attributes: { "aria-hidden": "true" },
          }),
        ],
      ),
    ],
  );
}

function AutomationTriggerOption(props) {
  const value = props.value;
  const selected = computed(props.current, (type) => type === value);
  return View(
    {
      class: computed(
        selected,
        (is_selected) =>
          `dm-button dm-button--choice-card dm-interactive dm-focus-ring automation-trigger-option${
            is_selected ? " is-selected" : ""
          }`,
      ),
      attributes: {
        n: `${props.namePrefix}-trigger-option-${value.toLowerCase()}`,
        role: "radio",
        tabindex: "0",
        "aria-checked": computed(selected, (is_selected) =>
          is_selected ? "true" : "false",
        ),
      },
      onClick() {
        props.onSelect(value);
      },
      onKeyDown(event) {
        automation_activate(event, () => props.onSelect(value));
      },
    },
    [
      View({ class: "automation-trigger-option__name" }, [props.label]),
      View({ class: "automation-trigger-option__hint" }, [props.hint]),
    ],
  );
}

function AutomationCreatePipelineDialog(props) {
  const vm$ = props.store;
  return Dialog(
    {
      store: vm$.ui.create_dialog$,
      class: "automation-form-dialog",
      attributes: { n: "automation-create-dialog" },
    },
    [
      DialogHeader({}, [
        DialogTitle({}, ["创建 Pipeline"]),
        DialogDescription({}, [
          "选择触发方式并为开始节点声明接收参数；创建后 Pipeline 只包含开始节点，可继续添加后续节点。",
        ]),
      ]),
      DialogBody({}, [
        View({ class: "automation-form" }, [
          View({ class: "automation-form__legend" }, ["1. 触发方式"]),
          View(
            {
              class: "automation-trigger-options",
              attributes: {
                role: "radiogroup",
                "aria-label": "Pipeline 触发方式",
              },
            },
            [
              AutomationTriggerOption({
                store: vm$,
                current: vm$.state.create_trigger_type,
                namePrefix: "create",
                value: "Cron",
                label: "定时触发",
                hint: "按 Cron 计划执行",
                onSelect: vm$.methods.setCreateTriggerType,
              }),
              AutomationTriggerOption({
                store: vm$,
                current: vm$.state.create_trigger_type,
                namePrefix: "create",
                value: "Event",
                label: "事件触发",
                hint: "通过事件 Key 触发",
                onSelect: vm$.methods.setCreateTriggerType,
              }),
              AutomationTriggerOption({
                store: vm$,
                current: vm$.state.create_trigger_type,
                namePrefix: "create",
                value: "Manual",
                label: "手动触发",
                hint: "在页面中手动执行",
                onSelect: vm$.methods.setCreateTriggerType,
              }),
            ],
          ),
          Show({
            when: computed(
              vm$.state.create_trigger_type,
              (type) => type === "Event",
            ),
            ok() {
              return View({ class: "automation-form__field" }, [
                View({ class: "automation-form__label" }, ["事件 Key"]),
                Input({
                  store: vm$.ui.input_create_event_key$,
                  attributes: {
                    n: "automation-create-event-key",
                    autocomplete: "off",
                  },
                }),
              ]);
            },
          }),
          Show({
            when: computed(
              vm$.state.create_trigger_type,
              (type) => type === "Cron",
            ),
            ok() {
              return View({ class: "automation-form__field" }, [
                View({ class: "automation-form__label" }, ["Cron 表达式"]),
                Input({
                  store: vm$.ui.input_create_cron$,
                  attributes: { n: "automation-create-cron" },
                }),
              ]);
            },
          }),
          View({ class: "automation-form__row" }, [
            View({ class: "automation-form__field" }, [
              View({ class: "automation-form__label" }, ["2. Pipeline 名称"]),
              Input({
                store: vm$.ui.input_create_name$,
                attributes: { n: "automation-create-name" },
              }),
            ]),
            View({ class: "automation-form__field" }, [
              View({ class: "automation-form__label" }, ["描述"]),
              Input({
                store: vm$.ui.input_create_description$,
                attributes: { n: "automation-create-description" },
              }),
            ]),
          ]),
          View({ class: "automation-form__legend" }, ["3. 开始节点接收的参数"]),
          For({
            key: "uid",
            each: vm$.state.create_params,
            render(param_) {
              const param =
                param_ && param_.value !== undefined ? param_.value : param_;
              return View({ class: "automation-form__row" }, [
                View({ class: "automation-form__field" }, [
                  View({ class: "automation-form__label" }, ["参数名"]),
                  Input({
                    store: param.input_key$,
                    attributes: {
                      n: `automation-create-param-key-${param.uid}`,
                      placeholder: "例如 url",
                    },
                  }),
                ]),
                View({ class: "automation-form__field" }, [
                  View({ class: "automation-form__label" }, ["类型"]),
                  Select({
                    store: param.select_type$,
                    attributes: {
                      n: `automation-create-param-type-${param.uid}`,
                    },
                  }),
                ]),
                Button(
                  {
                    store: vm$.ui.btn_param_remove$.bind(param),
                    attributes: {
                      n: `automation-create-param-remove-${param.uid}`,
                      type: "button",
                      title: "移除参数",
                    },
                  },
                  ["移除"],
                ),
              ]);
            },
          }),
          Button(
            {
              store: vm$.ui.btn_param_add$,
              attributes: {
                n: "automation-create-param-add",
                type: "button",
              },
            },
            ["+ 添加参数"],
          ),
          Show({
            when: computed(
              vm$.state.create_trigger_type,
              (type) => type === "Cron",
            ),
            ok() {
              return View({ class: "automation-form__field dm-flex" }, [
                Checkbox({
                  store: vm$.ui.checkbox_create_enabled$,
                  attributes: { n: "automation-create-enabled" },
                }),
                View({ class: "automation-form__label" }, [
                  "创建后同时生成定时计划并启用",
                ]),
              ]);
            },
          }),
        ]),
      ]),
      DialogFooter({}, [
        Button(
          {
            store: vm$.ui.btn_create_cancel$,
            attributes: { n: "automation-create-cancel", type: "button" },
          },
          ["取消"],
        ),
        Button(
          {
            store: vm$.ui.btn_create_submit$,
            attributes: { n: "automation-create-submit", type: "button" },
          },
          ["创建 Pipeline"],
        ),
      ]),
    ],
  );
}

function AutomationDeletePipelineConfirm(props) {
  const vm$ = props.store;
  return Confirm({
    store: vm$.ui.delete_dialog$,
    class: "dm-dialog--sm",
    name: "automation-delete-pipeline",
    title: "删除 Pipeline",
    description: computed(vm$.state.selected_pipeline, (flow) =>
      flow
        ? `确定删除「${flow.name || flow.id}」？关联的流程定义将停止使用。`
        : "确定删除当前 Pipeline？",
    ),
    cancelText: "取消",
    okText: "删除 Pipeline",
  });
}

function AutomationToolFormRender(props) {
  const field_names = computed(props.store, (form) => {
    if (!form || !form.fields) return [];
    return Object.keys(form.fields);
  });
  return View(
    {
      class: "automation-service-form",
      attributes: { n: "automation-service-form" },
    },
    [
      For({
        each: field_names,
        render(name) {
          const form = props.store.value;
          if (!form || !form.fields) return null;
          const field$ = form.fields[name];
          if (!field$) return null;
          const field_schema = field$.form_schema || {};
          const field_id = `automation-service-field-${name}`;
          const inline = field_schema.control === "checkbox";
          return View(
            {
              class: [
                "automation-form__field automation-service-form__field",
                inline ? "dm-flex" : "",
                field_schema.control === "textarea" ? "is-wide" : "",
              ]
                .filter(Boolean)
                .join(" "),
              attributes: { n: `automation-service-form-${name}` },
            },
            [
              inline
                ? Checkbox({
                    store: field$.input,
                    attributes: {
                      id: field_id,
                      n: `automation-service-input-${name}`,
                      "aria-label": field_schema.label || name,
                      "aria-required": String(Boolean(field_schema.required)),
                    },
                  })
                : View(
                    {
                      as: "label",
                      class: "automation-form__label",
                      attributes: { for: field_id },
                    },
                    [
                      field_schema.label || name,
                      field_schema.required ? " *" : "",
                    ],
                  ),
              Match({
                when: computed(field$, () => field_schema.control),
                cases: {
                  select() {
                    return Select({
                      store: field$.input,
                      attributes: {
                        id: field_id,
                        n: `automation-service-input-${name}`,
                        "aria-label": field_schema.label || name,
                        "aria-required": String(Boolean(field_schema.required)),
                      },
                    });
                  },
                  textarea() {
                    return Textarea({
                      store: field$.input,
                      attributes: {
                        id: field_id,
                        n: `automation-service-input-${name}`,
                        rows: "4",
                        "aria-label": field_schema.label || name,
                        "aria-required": String(Boolean(field_schema.required)),
                      },
                    });
                  },
                  input() {
                    return Input({
                      store: field$.input,
                      attributes: {
                        id: field_id,
                        n: `automation-service-input-${name}`,
                        autocomplete: "off",
                        "aria-required": String(Boolean(field_schema.required)),
                        inputmode:
                          field_schema.type === "integer" ||
                          field_schema.type === "number"
                            ? "decimal"
                            : undefined,
                      },
                    });
                  },
                  checkbox() {
                    return View(
                      {
                        as: "label",
                        class: "automation-form__label",
                        attributes: { for: field_id },
                      },
                      [
                        field_schema.label || name,
                        field_schema.required ? " *" : "",
                      ],
                    );
                  },
                },
              }),
              field_schema.description
                ? View(
                    {
                      class: "automation-service-form__help",
                      attributes: { title: field_schema.description },
                    },
                    [field_schema.description],
                  )
                : null,
            ].filter(Boolean),
          );
        },
      }),
    ],
  );
}

function AutomationAddNodeDialog(props) {
  const vm$ = props.store;
  return Dialog(
    {
      store: vm$.ui.add_dialog$,
      class: "automation-form-dialog",
      attributes: { n: "automation-add-dialog" },
    },
    [
      DialogHeader({}, [
        DialogTitle({}, ["添加节点"]),
        DialogDescription({}, [
          "选择节点类型并填入配置；新节点会连接到所选节点的后面。",
        ]),
      ]),
      DialogBody({}, [
        View({ class: "automation-form" }, [
          View({ class: "automation-form__row" }, [
            View({ class: "automation-form__field" }, [
              View({ class: "automation-form__label" }, ["节点类型"]),
              Select({
                store: vm$.ui.select_add_type$,
                attributes: {
                  n: "automation-add-type",
                  "aria-label": "选择节点类型",
                },
              }),
            ]),
            View({ class: "automation-form__field" }, [
              View({ class: "automation-form__label" }, ["连接自"]),
              Select({
                store: vm$.ui.select_add_from$,
                attributes: {
                  n: "automation-add-from",
                  "aria-label": "连接自哪个节点",
                },
              }),
            ]),
          ]),
          Show({
            when: computed(
              vm$.state.add_type,
              (node_type) => node_type === "ServiceNode",
            ),
            ok() {
              return View({ class: "automation-form__field" }, [
                View({ class: "automation-form__label" }, ["Service tool"]),
                Select({
                  store: vm$.ui.select_add_service_tool$,
                  attributes: {
                    n: "automation-add-service-tool",
                    "aria-label": "选择要调用的 Service tool",
                  },
                }),
              ]);
            },
          }),
          Show({
            when: vm$.state.add_service_tool,
            ok() {
              const tool = vm$.methods.catalogServiceTool(
                vm$.state.add_service_tool.value,
              );
              if (!tool) return View({});
              const input_schema = tool.input_schema || tool.inputSchema || {};
              const argument_names = Object.keys(input_schema.properties || {});
              return View({ class: "dm-alert automation-form__hint" }, [
                tool.description || tool.title || tool.name,
                "（参数：",
                argument_names.join("、") || "无",
                "）",
              ]);
            },
          }),
          Show({
            when: vm$.state.add_service_tool,
            ok() {
              return Show({
                when: computed(
                  vm$.state.add_service_form_schema,
                  (form_schema) =>
                    Array.isArray(form_schema) && form_schema.length > 0,
                ),
                ok() {
                  return View(
                    { class: "automation-service-form-section" },
                    [
                      View({ class: "automation-form__label" }, [
                        "Tool 参数",
                      ]),
                      AutomationToolFormRender({
                        store: vm$.state.add_service_form,
                      }),
                    ],
                  );
                },
                else() {
                  return View({ class: "dm-alert automation-form__hint" }, [
                    "该 tool 无需填写参数。",
                  ]);
                },
              });
            },
          }),
          Show({
            when: vm$.state.add_service_form_error,
            ok() {
              return View(
                {
                  class: "dm-alert is-destructive",
                  attributes: { role: "alert" },
                },
                [vm$.state.add_service_form_error],
              );
            },
          }),
          Show({
            when: vm$.state.add_type,
            ok() {
              return View({ class: "dm-alert automation-form__hint" }, [
                vm$.methods.catalogDescription(vm$.state.add_type.value),
                "（配置键：",
                vm$.methods
                  .catalogConfigKeys(vm$.state.add_type.value)
                  .map((key) => `${key.key}${key.required ? "*" : ""}`)
                  .join("、") || "无",
                "）",
              ]);
            },
          }),
          View({ class: "automation-form__field" }, [
            View({ class: "automation-form__label" }, ["节点名称"]),
            Input({
              store: vm$.ui.input_add_name$,
              attributes: { n: "automation-add-name" },
            }),
          ]),
          View({ class: "automation-form__field" }, [
            View({ class: "automation-form__label" }, ["节点配置 JSON"]),
            Input({
              store: vm$.ui.input_add_config$,
              attributes: {
                n: "automation-add-config",
                autocomplete: "off",
              },
            }),
          ]),
        ]),
      ]),
      DialogFooter({}, [
        Button(
          {
            store: vm$.ui.btn_add_cancel$,
            attributes: { n: "automation-add-cancel", type: "button" },
          },
          ["取消"],
        ),
        Button(
          {
            store: vm$.ui.btn_add_submit$,
            attributes: { n: "automation-add-submit", type: "button" },
          },
          ["添加节点"],
        ),
      ]),
    ],
  );
}

function AutomationCreateScheduleDialog(props) {
  const vm$ = props.store;
  return Dialog(
    {
      store: vm$.ui.schedule_dialog$,
      class: "automation-form-dialog",
      attributes: { n: "automation-schedule-dialog" },
    },
    [
      DialogHeader({}, [
        DialogTitle({}, ["创建自动化流程"]),
        DialogDescription({}, ["把 Pipeline 接入定时 / 事件 / 手动触发。"]),
      ]),
      DialogBody({}, [
        View({ class: "automation-form" }, [
          View({ class: "automation-form__legend" }, ["触发方式"]),
          View(
            {
              class: "automation-trigger-options",
              attributes: {
                role: "radiogroup",
                "aria-label": "自动化流程触发方式",
              },
            },
            [
              AutomationTriggerOption({
                store: vm$,
                current: vm$.state.schedule_trigger_type,
                namePrefix: "schedule",
                value: "Cron",
                label: "定时触发",
                hint: "按 Cron 计划执行",
                onSelect: vm$.methods.setScheduleTriggerType,
              }),
              AutomationTriggerOption({
                store: vm$,
                current: vm$.state.schedule_trigger_type,
                namePrefix: "schedule",
                value: "Event",
                label: "事件触发",
                hint: "通过事件 Key 触发",
                onSelect: vm$.methods.setScheduleTriggerType,
              }),
              AutomationTriggerOption({
                store: vm$,
                current: vm$.state.schedule_trigger_type,
                namePrefix: "schedule",
                value: "Manual",
                label: "手动触发",
                hint: "在列表中手动执行",
                onSelect: vm$.methods.setScheduleTriggerType,
              }),
            ],
          ),
          Show({
            when: computed(
              vm$.state.schedule_trigger_type,
              (type) => type === "Event",
            ),
            ok() {
              return View({ class: "automation-form__field" }, [
                View({ class: "automation-form__label" }, ["事件 Key"]),
                Input({
                  store: vm$.ui.input_schedule_event_key$,
                  attributes: { n: "automation-schedule-event-key" },
                }),
              ]);
            },
          }),
          Show({
            when: computed(
              vm$.state.schedule_trigger_type,
              (type) => type === "Cron",
            ),
            ok() {
              return View({ class: "automation-form__field" }, [
                View({ class: "automation-form__label" }, ["Cron 表达式"]),
                Input({
                  store: vm$.ui.input_schedule_cron$,
                  attributes: { n: "automation-schedule-cron" },
                }),
              ]);
            },
          }),
          View({ class: "automation-form__row" }, [
            View({ class: "automation-form__field" }, [
              View({ class: "automation-form__label" }, ["Pipeline"]),
              Select({
                store: vm$.ui.select_schedule_flow$,
                attributes: { n: "automation-schedule-flow" },
              }),
            ]),
            View({ class: "automation-form__field" }, [
              View({ class: "automation-form__label" }, ["开始节点"]),
              Select({
                store: vm$.ui.select_schedule_start$,
                attributes: { n: "automation-schedule-start" },
              }),
            ]),
          ]),
          View({ class: "automation-form__field" }, [
            View({ class: "automation-form__label" }, ["流程名称"]),
            Input({
              store: vm$.ui.input_schedule_name$,
              attributes: { n: "automation-schedule-name" },
            }),
          ]),
        ]),
      ]),
      DialogFooter({}, [
        Button(
          {
            store: vm$.ui.btn_schedule_cancel$,
            attributes: { n: "automation-schedule-cancel", type: "button" },
          },
          ["取消"],
        ),
        Button(
          {
            store: vm$.ui.btn_schedule_submit$,
            attributes: { n: "automation-schedule-submit", type: "button" },
          },
          ["创建流程"],
        ),
      ]),
    ],
  );
}

export default AutomationPageView;
