package api

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAutomationRoutesUsePostActionNames(t *testing.T) {
	gin.SetMode(gin.TestMode)
	client := &APIClient{engine: gin.New()}
	client.setup_automation_routes()

	expected_routes := map[string]bool{
		"/api/v1/automation/list_schedules":   false,
		"/api/v1/automation/create_schedule":  false,
		"/api/v1/automation/get_schedule":     false,
		"/api/v1/automation/update_schedule":  false,
		"/api/v1/automation/delete_schedule":  false,
		"/api/v1/automation/toggle_schedule":  false,
		"/api/v1/automation/trigger_schedule": false,
		"/api/v1/automation/list_runs":        false,
		"/api/v1/automation/get_run":          false,
		"/api/v1/automation/cancel_run":       false,
		"/api/v1/automation/list_flows":       false,
		"/api/v1/automation/create_flow":      false,
		"/api/v1/automation/get_flow":         false,
		"/api/v1/automation/update_flow":      false,
		"/api/v1/automation/delete_flow":      false,
		"/api/v1/automation/list_flow_nodes":  false,
		"/api/v1/automation/get_flow_graph":   false,
		"/api/v1/automation/trigger_flow":     false,
	}

	for _, route := range client.engine.Routes() {
		if route.Method != http.MethodPost {
			t.Fatalf("automation route %s uses %s, want POST", route.Path, route.Method)
		}
		if _, ok := expected_routes[route.Path]; !ok {
			t.Fatalf("unexpected automation route: %s", route.Path)
		}
		expected_routes[route.Path] = true
	}

	for route, registered := range expected_routes {
		if !registered {
			t.Errorf("automation route is not registered: %s", route)
		}
	}
}
