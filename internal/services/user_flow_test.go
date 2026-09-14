package services

import (
	"testing"

	"wx_channel/internal/database/model"
	servicetools "wx_channel/internal/services/tools"
	"wx_channel/pkg/flowengine/engine"
	"wx_channel/pkg/flowengine/nodes"
)

func new_user_flow_service(t *testing.T) *AutomationService {
	t.Helper()
	return new_verify_automation_service(t)
}

func TestCreateUserFlowProducesStartOnlyDefinition(t *testing.T) {
	service := new_user_flow_service(t)
	flow, err := service.CreateUserFlow(CreateUserFlowInput{
		Name:          "测试流程",
		TriggerType:   "Event",
		EventKey:      "test.event",
		ContextSchema: []engine.FieldSchema{{Key: "url", Type: "string", Required: true}},
	})
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	definition, err := decode_user_flow_definition(flow.Definition)
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(definition.Nodes) != 1 {
		t.Fatalf("expected single start node, got %d nodes", len(definition.Nodes))
	}
	start, ok := definition.Nodes["start"]
	if !ok || start.Type != "StartNode" {
		t.Fatalf("expected StartNode at 'start', got %+v", definition.Nodes)
	}
	if definition.StartNodeID != "start" {
		t.Fatalf("unexpected start node id: %s", definition.StartNodeID)
	}
	if definition.Nodes[definition.StartNodeID].Type != "StartNode" {
		t.Fatal("start node must be a StartNode")
	}
	if service.flow_engine.FlowDefinitions[flow.ID].ID != flow.ID {
		t.Fatal("created flow was not registered into the engine")
	}
}

func TestCreateUserFlowRequiresEventKeyForEventTrigger(t *testing.T) {
	service := new_user_flow_service(t)
	if _, err := service.CreateUserFlow(CreateUserFlowInput{Name: "x", TriggerType: "Event"}); err == nil {
		t.Fatal("expected event trigger without event_key to fail")
	}
}

func TestImportUserFlowBuildsFullGraph(t *testing.T) {
	service := new_user_flow_service(t)
	raw := `{
		"name": "导入流程",
		"start_node": "start",
		"context_schema": [{"key":"url","type":"string","required":true}],
		"nodes": {
			"start": {"id":"start","type":"StartNode","name":"开始","next_node_ids":["calc"]},
			"calc": {"id":"calc","type":"ExprNode","name":"计算","config":{"expression":"1 + 1"},"next_node_ids":["end"]},
			"end": {"id":"end","type":"EndNode","name":"结束"}
		}
	}`
	flow, err := service.ImportUserFlow(raw)
	if err != nil {
		t.Fatalf("import failed: %v", err)
	}
	definition, err := decode_user_flow_definition(flow.Definition)
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if definition.ID != flow.ID {
		t.Fatalf("definition id = %s, want flow id %s", definition.ID, flow.ID)
	}
	if definition.StartNodeID != "start" {
		t.Fatalf("start node id = %s, want start", definition.StartNodeID)
	}
	if len(definition.Nodes) != 3 {
		t.Fatalf("expected 3 nodes, got %d", len(definition.Nodes))
	}
	start := definition.Nodes["start"]
	if len(start.NextNodeIDs) != 1 || start.NextNodeIDs[0] != "calc" {
		t.Fatalf("start NextNodeIDs = %+v", start.NextNodeIDs)
	}
	if len(start.NextNodes) != 1 || start.NextNodes[0].TargetID != "calc" {
		t.Fatalf("start NextNodes = %+v", start.NextNodes)
	}
	if service.flow_engine.FlowDefinitions[flow.ID].ID != flow.ID {
		t.Fatal("imported flow was not registered into the engine")
	}
}

func TestImportUserFlowWithGatewayAndServiceNodes(t *testing.T) {
	service := new_user_flow_service(t)
	raw := `{
		"name": "手动触发：直播下载流程",
		"start_node": "start",
		"context_schema": [{"key":"username","type":"string","required":true}],
		"nodes": {
			"start": {"id":"start","type":"StartNode","name":"开始","next_node_ids":["fetch_videos"]},
			"fetch_videos": {"id":"fetch_videos","type":"ServiceNode","name":"获取视频列表","config":{"tool_name":"get_wxchannels_account_videos","arguments":{"username":"{{input.username}}"},"output_key":"videos"},"next_node_ids":["check_live"]},
			"check_live": {"id":"check_live","type":"GatewayNode","name":"是否直播","config":{"gateway_type":"Exclusive","is_joining":false,"rules":[{"condition":"len(videos.data.object) > 0 && videos.data.object[0].liveInfo != nil","target_id":"download_live"},{"condition":"true","target_id":"end"}]},"next_node_ids":["download_live","end"]},
			"download_live": {"id":"download_live","type":"ServiceNode","name":"创建直播下载任务","config":{"tool_name":"download_wxchannels_live","arguments":{"account":"{{input.username}}"}},"next_node_ids":["end"]},
			"end": {"id":"end","type":"EndNode","name":"结束"}
		}
	}`
	flow, err := service.ImportUserFlow(raw)
	if err != nil {
		t.Fatalf("import failed: %v", err)
	}
	definition, err := decode_user_flow_definition(flow.Definition)
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(definition.Nodes) != 5 {
		t.Fatalf("expected 5 nodes, got %d", len(definition.Nodes))
	}
	gateway := definition.Nodes["check_live"]
	if gateway.Type != "GatewayNode" {
		t.Fatalf("unexpected gateway type: %s", gateway.Type)
	}
	rules, ok := gateway.Config["rules"].([]interface{})
	if !ok || len(rules) != 2 {
		t.Fatalf("gateway rules not preserved: %#v", gateway.Config["rules"])
	}
	if len(definition.Nodes["start"].NextNodeIDs) != 1 || definition.Nodes["start"].NextNodeIDs[0] != "fetch_videos" {
		t.Fatalf("start edge missing: %+v", definition.Nodes["start"].NextNodeIDs)
	}
}

func TestImportUserFlowRejectsDanglingEdge(t *testing.T) {
	service := new_user_flow_service(t)
	raw := `{
		"name": "悬空流程",
		"start_node": "start",
		"nodes": {
			"start": {"id":"start","type":"StartNode","name":"开始","next_node_ids":["ghost"]}
		}
	}`
	if _, err := service.ImportUserFlow(raw); err == nil {
		t.Fatal("expected dangling edge import to fail")
	}
}

func TestTriggerFlowDirectRunsCronFlowAsManual(t *testing.T) {
	service := new_user_flow_service(t)
	service.flow_engine.RegisterNode("StartNode", nodes.NewStartNode)
	flow, err := service.CreateUserFlow(CreateUserFlowInput{
		Name:        "Cron 调试流程",
		TriggerType: model.FlowRunTriggerCron,
	})
	if err != nil {
		t.Fatalf("create Cron flow: %v", err)
	}
	run, err := service.TriggerFlowDirect(flow.ID, nil)
	if err != nil {
		t.Fatalf("manually trigger Cron flow: %v", err)
	}
	if run.TriggerType != model.FlowRunTriggerManual {
		t.Fatalf("trigger type = %s, want Manual", run.TriggerType)
	}
	if run.TriggerKey != "" {
		t.Fatalf("manual trigger key = %q, want empty", run.TriggerKey)
	}
	if run.Status != model.FlowRunStatusCompleted {
		t.Fatalf("run status = %s, want COMPLETED: %s", run.Status, run.Error)
	}
	saved_flow, err := service.GetUserFlow(flow.ID)
	if err != nil {
		t.Fatalf("reload flow: %v", err)
	}
	if saved_flow.TriggerType != model.FlowRunTriggerCron {
		t.Fatalf("saved trigger type changed to %s", saved_flow.TriggerType)
	}
}

func TestUpdateUserFlowAppendsNodeAndEdge(t *testing.T) {
	service := new_user_flow_service(t)
	flow, err := service.CreateUserFlow(CreateUserFlowInput{Name: "编辑流程"})
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	updated, err := service.UpdateUserFlow(flow.ID, UpdateUserFlowInput{
		Nodes: []UserFlowNodeInput{
			{ID: "start", Type: "StartNode", Name: "开始", Position: &engine.NodePosition{X: 48, Y: 72}, NextIDs: []string{"calc"}},
			{ID: "calc", Type: "ExprNode", Name: "计算", Config: map[string]interface{}{
				"expression": "1 + 1",
			}, NextIDs: []string{"end"}},
			{ID: "end", Type: "EndNode", Name: "结束"},
		},
	})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	definition, err := decode_user_flow_definition(updated.Definition)
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(definition.Nodes) != 3 {
		t.Fatalf("expected 3 nodes, got %d", len(definition.Nodes))
	}
	if len(definition.Nodes["start"].NextNodes) != 1 || definition.Nodes["start"].NextNodes[0].TargetID != "calc" {
		t.Fatalf("start node edge missing: %+v", definition.Nodes["start"])
	}
	if definition.Nodes["start"].Position == nil || definition.Nodes["start"].Position.X != 48 || definition.Nodes["start"].Position.Y != 72 {
		t.Fatalf("start node position missing: %+v", definition.Nodes["start"].Position)
	}
	if service.flow_engine.FlowDefinitions[flow.ID].Nodes["calc"].ID != "calc" {
		t.Fatal("updated definition was not re-registered into the engine")
	}

	payload, err := service.UserFlowVisualization(flow.ID)
	if err != nil {
		t.Fatalf("visualization failed: %v", err)
	}
	if len(payload.Flows) != 1 || len(payload.Flows[0].Nodes) != 3 {
		t.Fatalf("unexpected visualization payload: %+v", payload)
	}
}

func TestUpdateUserFlowRejectsUnknownTargetAndType(t *testing.T) {
	service := new_user_flow_service(t)
	flow, _ := service.CreateUserFlow(CreateUserFlowInput{Name: "校验流程"})
	if _, err := service.UpdateUserFlow(flow.ID, UpdateUserFlowInput{
		Nodes: []UserFlowNodeInput{
			{ID: "start", Type: "StartNode", Name: "开始", NextIDs: []string{"ghost"}},
		},
	}); err == nil {
		t.Fatal("expected dangling edge to fail")
	}
	if _, err := service.UpdateUserFlow(flow.ID, UpdateUserFlowInput{
		Nodes: []UserFlowNodeInput{
			{ID: "start", Type: "FuncNode", Name: "开始"},
		},
	}); err == nil {
		t.Fatal("expected FuncNode to be rejected")
	}
}

func TestUserFlowCatalogIncludesEveryServiceTool(t *testing.T) {
	var service_node *UserFlowNodeCatalogItem
	for index := range SortedUserFlowNodeCatalog() {
		item := SortedUserFlowNodeCatalog()[index]
		if item.Type == "ServiceNode" {
			service_node = &item
			break
		}
	}
	if service_node == nil {
		t.Fatal("ServiceNode missing from catalog")
	}
	if len(service_node.Tools) != len(servicetools.BuiltinCatalog()) {
		t.Fatalf("ServiceNode exposes %d tools, want %d", len(service_node.Tools), len(servicetools.BuiltinCatalog()))
	}
}

func TestUpdateUserFlowValidatesServiceTool(t *testing.T) {
	service := new_user_flow_service(t)
	flow, _ := service.CreateUserFlow(CreateUserFlowInput{Name: "服务流程"})
	nodes := []UserFlowNodeInput{
		{ID: "start", Type: "StartNode", Name: "开始", NextIDs: []string{"service"}},
		{ID: "service", Type: "ServiceNode", Name: "读取状态", Config: map[string]interface{}{
			"tool_name":  "get_platform_status",
			"arguments":  map[string]interface{}{},
			"output_key": "platform_status",
		}},
	}
	if _, err := service.UpdateUserFlow(flow.ID, UpdateUserFlowInput{Nodes: nodes}); err != nil {
		t.Fatalf("valid ServiceNode was rejected: %v", err)
	}
	nodes[1].Config["tool_name"] = "not_a_tool"
	if _, err := service.UpdateUserFlow(flow.ID, UpdateUserFlowInput{Nodes: nodes}); err == nil {
		t.Fatal("expected unknown service tool to be rejected")
	}
}

func TestDeleteUserFlowDetachesEngine(t *testing.T) {
	service := new_user_flow_service(t)
	flow, _ := service.CreateUserFlow(CreateUserFlowInput{Name: "删除流程"})
	if err := service.DeleteUserFlow(flow.ID); err != nil {
		t.Fatalf("delete failed: %v", err)
	}
	if _, ok := service.flow_engine.FlowDefinitions[flow.ID]; ok {
		t.Fatal("deleted flow still registered in the engine")
	}
	if _, err := service.GetUserFlow(flow.ID); err == nil {
		t.Fatal("deleted flow still readable")
	}
}
