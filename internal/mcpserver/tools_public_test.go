package mcpserver

import (
	"context"
	"testing"
)

func TestToolCatalogMatchesToolNames(t *testing.T) {
	names := ToolNames()
	catalog := ToolCatalog()
	if len(catalog) != len(names) {
		t.Fatalf("catalog length %d does not match names length %d", len(catalog), len(names))
	}
	for index, tool := range catalog {
		if tool.Name != names[index] {
			t.Fatalf("catalog tool %d is %q, want %q", index, tool.Name, names[index])
		}
		if tool.InputSchema == nil {
			t.Fatalf("tool %s has no input schema", tool.Name)
		}
		if tool.FormSchema == nil {
			t.Fatalf("tool %s has no form schema", tool.Name)
		}
	}
}

func TestToolCatalogBuildsDynamicFormSchema(t *testing.T) {
	var fetch_tool *ToolDefinition
	var download_tool *ToolDefinition
	var account_videos_tool *ToolDefinition
	catalog := ToolCatalog()
	for index := range catalog {
		switch catalog[index].Name {
		case "fetch_content":
			fetch_tool = &catalog[index]
		case "download_content":
			download_tool = &catalog[index]
		case "get_wxchannels_account_videos":
			account_videos_tool = &catalog[index]
		}
	}
	if fetch_tool == nil || download_tool == nil || account_videos_tool == nil {
		t.Fatal("expected fetch, download, and account video tools in catalog")
	}
	url_field := find_tool_form_field(fetch_tool.FormSchema, "url")
	if url_field == nil || !url_field.Required || url_field.Control != "input" {
		t.Fatalf("unexpected fetch url form field: %+v", url_field)
	}
	force_field := find_tool_form_field(fetch_tool.FormSchema, "force_refresh")
	if force_field == nil || force_field.Control != "checkbox" || !force_field.HasDefault {
		t.Fatalf("unexpected fetch force_refresh form field: %+v", force_field)
	}
	action_field := find_tool_form_field(download_tool.FormSchema, "existing_action")
	if action_field == nil || action_field.Control != "select" || len(action_field.Options) != 4 {
		t.Fatalf("unexpected existing_action form field: %+v", action_field)
	}
	username_field := find_tool_form_field(account_videos_tool.FormSchema, "username")
	if username_field == nil || !username_field.Required || username_field.Control != "input" {
		t.Fatalf("unexpected account videos username form field: %+v", username_field)
	}
	next_marker_field := find_tool_form_field(account_videos_tool.FormSchema, "next_marker")
	if next_marker_field == nil || next_marker_field.Required || next_marker_field.Control != "input" {
		t.Fatalf("unexpected account videos next_marker form field: %+v", next_marker_field)
	}
}

func find_tool_form_field(schema []ToolFormField, name string) *ToolFormField {
	for index := range schema {
		if schema[index].Name == name {
			return &schema[index]
		}
	}
	return nil
}

func TestExecuteToolRejectsUnknownTool(t *testing.T) {
	server, err := NewServer(Config{APIBaseURL: "http://127.0.0.1:1"})
	if err != nil {
		t.Fatalf("create server: %v", err)
	}
	if _, err := server.ExecuteTool(context.Background(), "not_a_tool", nil); err == nil {
		t.Fatal("expected unknown tool to fail")
	}
}
