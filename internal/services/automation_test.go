package services

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"github.com/ltaoo/velo"
	"github.com/rs/zerolog"

	"wx_channel/internal/database"
	"wx_channel/internal/database/model"
	"wx_channel/internal/events"
	"wx_channel/pkg/flowengine/engine"
)

func TestAutomationServiceWritesStructuredNodeExecutionLog(t *testing.T) {
	var log_buffer bytes.Buffer
	logger := zerolog.New(&log_buffer)
	event_bus := events.NewBus()
	node_statuses := make([]events.AutomationNodeStatusChanged, 0, 2)
	node_logs := make([]events.AutomationNodeLogCreated, 0, 1)
	event_bus.Subscribe(events.TypeAutomationNodeStatus, func(event events.Event) {
		if status, ok := event.(events.AutomationNodeStatusChanged); ok {
			node_statuses = append(node_statuses, status)
		}
	})
	event_bus.Subscribe(events.TypeAutomationNodeLog, func(event events.Event) {
		if entry, ok := event.(events.AutomationNodeLogCreated); ok {
			node_logs = append(node_logs, entry)
		}
	})
	flow_engine := &engine.FlowEngine{}
	flow_engine.RegisterNode("verify", func(config map[string]interface{}) engine.Node {
		id, _ := config["id"].(string)
		return &verify_node{id: id}
	})
	flow_engine.SetFlowDefinitions(map[string]engine.FlowDefinition{
		"flow-log": {
			ID:          "flow-log",
			StartNodeID: "node-log",
			Nodes: map[string]engine.NodeDefinition{
				"node-log": {
					ID:     "node-log",
					Name:   "log node",
					Type:   "verify",
					Config: map[string]interface{}{"operation": "verify"},
				},
			},
		},
	})
	NewAutomationService(nil, &logger, flow_engine, event_bus)

	if _, err := flow_engine.StartFlowWithOptions(
		"flow-log",
		map[string]interface{}{"input": "value"},
		engine.StartFlowOptions{RunID: "run-log"},
	); err != nil {
		t.Fatalf("StartFlow failed: %v", err)
	}
	if len(node_statuses) != 2 || node_statuses[0].Node.Status != engine.StateRunning || node_statuses[1].Node.Status != engine.StateCompleted {
		t.Fatalf("unexpected node status events: %#v", node_statuses)
	}
	if len(node_logs) != 1 || node_logs[0].Log.RunID != "run-log" {
		t.Fatalf("unexpected node log events: %#v", node_logs)
	}
	var log_entry map[string]interface{}
	if err := json.Unmarshal(bytes.TrimSpace(log_buffer.Bytes()), &log_entry); err != nil {
		t.Fatalf("decode node execution log failed: %v; log=%s", err, log_buffer.String())
	}
	if log_entry["event"] != "automation_node_execution" || log_entry["node_type"] != "verify" {
		t.Fatalf("unexpected structured node log: %#v", log_entry)
	}
	if _, ok := log_entry["node_input"].(map[string]interface{}); !ok {
		t.Fatalf("expected node_input object, got %#v", log_entry["node_input"])
	}
	if _, ok := log_entry["node_behavior"].(map[string]interface{}); !ok {
		t.Fatalf("expected node_behavior object, got %#v", log_entry["node_behavior"])
	}
	if output, ok := log_entry["node_output"].(map[string]interface{}); !ok || output["ran"] != true {
		t.Fatalf("expected node output, got %#v", log_entry["node_output"])
	}
}

// verify_node is a minimal flow node used to prove a scheduled run executes.
type verify_node struct {
	id string
}

func (n *verify_node) ID() string   { return n.id }
func (n *verify_node) Type() string { return "verify" }

func (n *verify_node) Execute(ctx *engine.ProcessContext) (bool, []string, error) {
	ctx.Data["ran"] = true
	return true, nil, nil
}

func new_verify_automation_service(t *testing.T) *AutomationService {
	t.Helper()
	app := velo.NewApp(&velo.VeloAppOpt{Mode: velo.ModeHttp})
	db_path := filepath.Join(t.TempDir(), "automation.db")
	if err := app.Migrate(&velo.VeloDatabaseOpt{
		DBType:                    velo.DBTypeSQLite,
		DBPath:                    database.SQLiteDSN(db_path),
		Migrations:                &database.Migrations,
		DisableTimestampCallbacks: true,
	}); err != nil {
		t.Fatalf("migrate failed: %v", err)
	}
	if err := database.ConfigureSQLiteRuntime(app.DB); err != nil {
		t.Fatalf("configure sqlite failed: %v", err)
	}
	if app.DB == nil {
		t.Fatal("migration produced no database handle")
	}

	flow_engine := engine.FlowEngine{}
	flow_engine.SetFlowDefinitions(map[string]engine.FlowDefinition{
		"flow-verify": {
			ID:          "flow-verify",
			StartNodeID: "n1",
			Nodes: map[string]engine.NodeDefinition{
				"n1": {ID: "n1", Type: "verify"},
				"n2": {ID: "n2", Type: "verify"},
			},
		},
	})
	flow_engine.RegisterNode("verify", func(config map[string]interface{}) engine.Node {
		id, _ := config["id"].(string)
		if id == "" {
			id = "n1"
		}
		return &verify_node{id: id}
	})
	return NewAutomationService(app.DB, nil, &flow_engine, nil)
}

func TestAutomationServiceScheduleLifecycle(t *testing.T) {
	service := new_verify_automation_service(t)
	defer service.Stop()

	schedule, err := service.CreateSchedule(CreateScheduleInput{
		Name:     "every minute",
		CronExpr: "@every 1m",
		FlowID:   "flow-verify",
	})
	if err != nil {
		t.Fatalf("CreateSchedule failed: %v", err)
	}
	if !schedule.Enabled {
		t.Fatal("expected a new schedule to be enabled")
	}
	if schedule.NextRunAt == nil || *schedule.NextRunAt <= time.Now().UnixMilli() {
		t.Fatalf("expected a future next_run_at, got %v", schedule.NextRunAt)
	}

	// Invalid cron expressions must be rejected before anything is persisted.
	if _, err := service.CreateSchedule(CreateScheduleInput{
		Name:     "broken",
		CronExpr: "not a cron",
		FlowID:   "flow-verify",
	}); err == nil {
		t.Fatal("expected an invalid cron expression to be rejected")
	}

	run, err := service.TriggerSchedule(schedule.ID)
	if err != nil {
		t.Fatalf("TriggerSchedule failed: %v", err)
	}
	if run.Status != model.FlowRunStatusCompleted {
		t.Fatalf("expected a completed run, got %s (%s)", run.Status, run.Error)
	}
	if run.TriggerType != model.FlowRunTriggerManual {
		t.Fatalf("expected a manual trigger, got %s", run.TriggerType)
	}

	// The schedule must record the outcome and move past the fire time so the
	// next tick does not immediately re-run it.
	reloaded, err := service.GetSchedule(schedule.ID)
	if err != nil {
		t.Fatalf("GetSchedule failed: %v", err)
	}
	if reloaded.LastRunID != run.ID || reloaded.LastRunStatus != model.FlowRunStatusCompleted {
		t.Fatalf("expected the schedule to record %s/%s, got %s/%s",
			run.ID, model.FlowRunStatusCompleted, reloaded.LastRunID, reloaded.LastRunStatus)
	}

	runs, total, err := service.ListRuns(ListRunsInput{ScheduleID: schedule.ID})
	if err != nil {
		t.Fatalf("ListRuns failed: %v", err)
	}
	if total != 1 || len(runs) != 1 {
		t.Fatalf("expected 1 run, got total=%d len=%d", total, len(runs))
	}

	disabled, err := service.ToggleSchedule(schedule.ID)
	if err != nil {
		t.Fatalf("ToggleSchedule failed: %v", err)
	}
	if disabled.Enabled || disabled.NextRunAt != nil {
		t.Fatalf("expected a disabled schedule with no next_run_at, got enabled=%v next=%v",
			disabled.Enabled, disabled.NextRunAt)
	}

	if err := service.DeleteSchedule(schedule.ID); err != nil {
		t.Fatalf("DeleteSchedule failed: %v", err)
	}
	if _, err := service.GetSchedule(schedule.ID); err == nil {
		t.Fatal("expected a deleted schedule to be unreadable")
	}
	schedules, total, err := service.ListSchedules(ListSchedulesInput{})
	if err != nil {
		t.Fatalf("ListSchedules failed: %v", err)
	}
	if total != 0 || len(schedules) != 0 {
		t.Fatalf("expected no schedules after deletion, got total=%d len=%d", total, len(schedules))
	}
}

func TestAutomationServiceEventTriggerUsesConfiguredStartNode(t *testing.T) {
	service := new_verify_automation_service(t)
	defer service.Stop()

	schedule, err := service.CreateSchedule(CreateScheduleInput{
		Name:     "feed event",
		CronExpr: "@daily",
		FlowID:   "flow-verify",
		InitialData: map[string]interface{}{
			"__automation": map[string]interface{}{
				"type":       model.FlowRunTriggerEvent,
				"start_node": "n2",
				"event_key":  "channels.feed.received",
			},
		},
	})
	if err != nil {
		t.Fatalf("CreateSchedule failed: %v", err)
	}
	if schedule.Enabled || schedule.NextRunAt != nil {
		t.Fatalf("expected an event flow to disable cron scheduling, got enabled=%v next=%v", schedule.Enabled, schedule.NextRunAt)
	}

	run, err := service.TriggerScheduleAs(schedule.ID, model.FlowRunTriggerEvent, "")
	if err != nil {
		t.Fatalf("TriggerScheduleAs failed: %v", err)
	}
	if run.TriggerType != model.FlowRunTriggerEvent {
		t.Fatalf("expected an event trigger, got %s", run.TriggerType)
	}
	if run.TriggerKey != "channels.feed.received" {
		t.Fatalf("expected the configured event key, got %s", run.TriggerKey)
	}
	if run.Status != model.FlowRunStatusCompleted {
		t.Fatalf("expected a completed run, got %s (%s)", run.Status, run.Error)
	}
	if run.CurrentNode != "n2" {
		t.Fatalf("expected the run to start at n2, got %s", run.CurrentNode)
	}

	if _, err := service.ToggleSchedule(schedule.ID); err == nil {
		t.Fatal("expected enabling an event flow through cron scheduling to be rejected")
	}
}

func TestAutomationServiceTicksDueSchedules(t *testing.T) {
	service := new_verify_automation_service(t)
	defer service.Stop()

	schedule, err := service.CreateSchedule(CreateScheduleInput{
		Name:     "due now",
		CronExpr: "@every 1m",
		FlowID:   "flow-verify",
	})
	if err != nil {
		t.Fatalf("CreateSchedule failed: %v", err)
	}
	// Force the schedule into the past so the next tick considers it due.
	past := time.Now().Add(-time.Minute).UnixMilli()
	if err := service.db.Model(&model.FlowSchedule{}).
		Where("id = ?", schedule.ID).
		Update("next_run_at", past).Error; err != nil {
		t.Fatalf("failed to backdate schedule: %v", err)
	}

	service.tick()
	// execute_schedule runs in its own goroutine; wait for it to land.
	deadline := time.Now().Add(5 * time.Second)
	for {
		runs, total, err := service.ListRuns(ListRunsInput{ScheduleID: schedule.ID})
		if err != nil {
			t.Fatalf("ListRuns failed: %v", err)
		}
		if total > 0 {
			if runs[0].TriggerType != model.FlowRunTriggerCron {
				t.Fatalf("expected a cron trigger, got %s", runs[0].TriggerType)
			}
			if runs[0].Status != model.FlowRunStatusCompleted {
				t.Fatalf("expected a completed run, got %s (%s)", runs[0].Status, runs[0].Error)
			}
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("the scheduler tick never produced a run record")
		}
		time.Sleep(20 * time.Millisecond)
	}
}
