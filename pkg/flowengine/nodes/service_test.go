package nodes_test

import (
	"context"
	"reflect"
	"testing"

	"wx_channel/pkg/flowengine"
)

func TestServiceNodeCallsToolWithMappedContext(t *testing.T) {
	flow_engine := flowengine.NewWorkflowEngine()
	var called_tool string
	var called_arguments map[string]any
	flowengine.RegisterServiceNode(flow_engine, func(_ context.Context, tool_name string, arguments map[string]any) (any, error) {
		called_tool = tool_name
		called_arguments = arguments
		return map[string]any{"ok": true, "count": 2}, nil
	})

	output, err := flow_engine.RunNodeStandalone(flowengine.NodeDefinition{
		ID:   "service",
		Type: "ServiceNode",
		Config: map[string]interface{}{
			"id":        "service",
			"tool_name": "fetch_content",
			"arguments": map[string]interface{}{
				"force_refresh": true,
			},
			"input_map": map[string]interface{}{
				"url": "source_url",
			},
			"output_key": "fetch_result",
		},
	}, map[string]interface{}{"source_url": "https://example.com/post"})
	if err != nil {
		t.Fatalf("run service node: %v", err)
	}
	if called_tool != "fetch_content" {
		t.Fatalf("unexpected tool: %s", called_tool)
	}
	want_arguments := map[string]any{
		"force_refresh": true,
		"url":           "https://example.com/post",
	}
	if !reflect.DeepEqual(called_arguments, want_arguments) {
		t.Fatalf("unexpected arguments: %#v", called_arguments)
	}
	want_result := map[string]any{"ok": true, "count": 2}
	if !reflect.DeepEqual(output["fetch_result"], want_result) {
		t.Fatalf("unexpected service result: %#v", output["fetch_result"])
	}
}

func TestServiceNodeRejectsMissingMappedContext(t *testing.T) {
	flow_engine := flowengine.NewWorkflowEngine()
	flowengine.RegisterServiceNode(flow_engine, func(_ context.Context, _ string, _ map[string]any) (any, error) {
		t.Fatal("executor should not be called")
		return nil, nil
	})

	_, err := flow_engine.RunNodeStandalone(flowengine.NodeDefinition{
		ID:   "service",
		Type: "ServiceNode",
		Config: map[string]interface{}{
			"id":        "service",
			"tool_name": "fetch_content",
			"input_map": map[string]interface{}{"url": "missing_url"},
		},
	}, nil)
	if err == nil {
		t.Fatal("expected missing context value to fail")
	}
}
