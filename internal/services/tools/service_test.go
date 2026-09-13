package tools

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

type test_properties map[string]map[string]any

func TestServiceOwnsCatalogAndExecution(t *testing.T) {
	raw_definitions := []any{map[string]any{
		"name":        "lookup",
		"title":       "查询",
		"description": "查询一个对象",
		"inputSchema": map[string]any{
			"type": "object",
			"properties": test_properties{
				"username":    {"type": "string", "description": "账号 username"},
				"next_marker": {"type": "string", "description": "分页游标"},
			},
			"required": []string{"username"},
		},
	}}
	service, err := New(raw_definitions, nil, func(_ context.Context, name string, arguments json.RawMessage) (map[string]any, error) {
		if name != "lookup" {
			t.Fatalf("unexpected tool name: %s", name)
		}
		var decoded map[string]any
		if err := json.Unmarshal(arguments, &decoded); err != nil {
			t.Fatalf("decode arguments: %v", err)
		}
		return map[string]any{"structuredContent": decoded}, nil
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	definitions := service.Definitions()
	if len(definitions) != 1 || len(definitions[0].FormSchema) != 2 {
		t.Fatalf("unexpected catalog: %+v", definitions)
	}
	if definitions[0].FormSchema[0].Name != "username" || !definitions[0].FormSchema[0].Required {
		t.Fatalf("required fields must be first: %+v", definitions[0].FormSchema)
	}
	result, err := service.Execute(context.Background(), "lookup", map[string]any{"username": "demo"})
	if err != nil {
		t.Fatalf("execute tool: %v", err)
	}
	result_object, ok := result.(map[string]any)
	if !ok || result_object["username"] != "demo" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestServiceRejectsUnavailableAndUnknownTools(t *testing.T) {
	raw_definitions := []any{
		map[string]any{"name": "enabled", "inputSchema": map[string]any{"type": "object"}},
		map[string]any{"name": "disabled", "inputSchema": map[string]any{"type": "object"}},
	}
	service, err := New(raw_definitions, func(name string) bool {
		return name == "enabled"
	}, func(_ context.Context, _ string, _ json.RawMessage) (map[string]any, error) {
		return map[string]any{}, nil
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if names := service.Names(); len(names) != 1 || names[0] != "enabled" {
		t.Fatalf("unexpected enabled tools: %v", names)
	}
	if _, err := service.Execute(context.Background(), "disabled", nil); !errors.Is(err, ErrUnknownTool) {
		t.Fatalf("expected unknown tool error, got %v", err)
	}
}

func TestBuiltinCatalogDeclaresWxchannelsAccountVideoArguments(t *testing.T) {
	var account_videos_tool *Definition
	catalog := BuiltinCatalog()
	for index := range catalog {
		if catalog[index].Name == "get_wxchannels_account_videos" {
			account_videos_tool = &catalog[index]
			break
		}
	}
	if account_videos_tool == nil {
		t.Fatal("get_wxchannels_account_videos missing from builtin catalog")
	}
	username_field := find_form_field(account_videos_tool.FormSchema, "username")
	if username_field == nil || !username_field.Required {
		t.Fatalf("username must be a required form field: %+v", username_field)
	}
	next_marker_field := find_form_field(account_videos_tool.FormSchema, "next_marker")
	if next_marker_field == nil || next_marker_field.Required {
		t.Fatalf("next_marker must be an optional form field: %+v", next_marker_field)
	}
}

func find_form_field(schema []FormField, name string) *FormField {
	for index := range schema {
		if schema[index].Name == name {
			return &schema[index]
		}
	}
	return nil
}
