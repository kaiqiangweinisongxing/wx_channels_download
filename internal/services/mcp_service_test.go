package services

import (
	"context"
	"testing"
)

func TestLazyMCPServiceExecutesLocallyWithoutEnablingHTTP(t *testing.T) {
	service := NewLazyMCPService(MCPServiceConfig{
		APIBaseURL: "http://127.0.0.1:1",
		Version:    "test",
	})
	if service.Enabled() {
		t.Fatal("lazy MCP service should start disabled")
	}
	if _, err := service.ExecuteTool(context.Background(), "not_a_tool", nil); err == nil {
		t.Fatal("expected unknown tool to fail")
	}
	if service.Enabled() {
		t.Fatal("local tool execution must not enable MCP HTTP")
	}
	if service.server == nil || service.handler == nil {
		t.Fatal("local execution did not initialize the lazy MCP server")
	}
	if err := service.Enable(); err != nil {
		t.Fatalf("enable initialized MCP service: %v", err)
	}
	if !service.Enabled() {
		t.Fatal("MCP HTTP should be enabled after Enable")
	}
}

func TestMCPServiceExposesSharedToolCatalog(t *testing.T) {
	service := NewLazyMCPService(MCPServiceConfig{
		APIBaseURL: "http://127.0.0.1:1",
		Version:    "test",
	})
	if len(service.ToolCatalog()) == 0 {
		t.Fatal("expected static tool catalog before lazy initialization")
	}
	if _, err := service.ExecuteTool(context.Background(), "not_a_tool", nil); err == nil {
		t.Fatal("expected unknown tool to initialize the shared tool service")
	}
	if len(service.ToolCatalog()) != len(service.server.ToolCatalog()) {
		t.Fatal("MCP service and protocol server must share one tool catalog")
	}
}
