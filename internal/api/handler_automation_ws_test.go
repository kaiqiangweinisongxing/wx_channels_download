package api

import (
	"encoding/json"
	"testing"
	"time"

	"wx_channel/internal/events"
	"wx_channel/pkg/flowengine"
)

func TestAutomationWSMessageFromNodeEvents(t *testing.T) {
	status_message, ok := automation_ws_message_from_event(events.AutomationNodeStatusChanged{
		Node: flowengine.NodeExecutionStatus{
			FlowID: "flow-one",
			RunID:  "run-one",
			NodeID: "node-one",
			Status: flowengine.StateRunning,
		},
	})
	if !ok || status_message.Type != automation_node_status_ws_update {
		t.Fatalf("unexpected status message: %#v", status_message)
	}
	if status_message.NodeStatus == nil || status_message.NodeStatus.Status != flowengine.StateRunning {
		t.Fatalf("missing node status payload: %#v", status_message)
	}

	log_message, ok := automation_ws_message_from_event(events.AutomationNodeLogCreated{
		Log: flowengine.NodeExecutionLog{
			FlowID: "flow-one",
			RunID:  "run-one",
			NodeID: "node-one",
			Output: map[string]interface{}{"result": true},
		},
	})
	if !ok || log_message.Type != automation_node_log_ws_update {
		t.Fatalf("unexpected log message: %#v", log_message)
	}
	if log_message.ExecutionLog == nil || log_message.ExecutionLog.Output["result"] != true {
		t.Fatalf("missing execution log payload: %#v", log_message)
	}
}

func TestAutomationWSPoolFiltersByFlowAndRun(t *testing.T) {
	pool := new_automation_ws_pool()
	matching := &automation_ws_client{
		send:    make(chan []byte, 1),
		flow_id: "flow-one",
		run_id:  "run-one",
	}
	non_matching := &automation_ws_client{
		send:    make(chan []byte, 1),
		flow_id: "flow-two",
	}
	pool.add(matching)
	pool.add(non_matching)

	pool.broadcast(automation_ws_message{
		Type:   automation_node_status_ws_update,
		FlowID: "flow-one",
		RunID:  "run-one",
	})

	select {
	case raw := <-matching.send:
		var message automation_ws_message
		if err := json.Unmarshal(raw, &message); err != nil {
			t.Fatalf("decode broadcast: %v", err)
		}
		if message.FlowID != "flow-one" || message.RunID != "run-one" {
			t.Fatalf("unexpected broadcast: %#v", message)
		}
	case <-time.After(time.Second):
		t.Fatal("matching client did not receive the update")
	}

	select {
	case message := <-non_matching.send:
		t.Fatalf("non-matching client received %s", message)
	default:
	}
}
