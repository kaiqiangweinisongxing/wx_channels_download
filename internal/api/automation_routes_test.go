package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/ltaoo/velo"

	"wx_channel/internal/database"
	"wx_channel/internal/database/model"
	"wx_channel/internal/services"
	"wx_channel/pkg/flowengine"
)

func TestAutomationRoutesUsePostActionNames(t *testing.T) {
	gin.SetMode(gin.TestMode)
	client := &APIClient{engine: gin.New()}
	client.setup_automation_routes()

	expected_routes := map[string]bool{
		"/ws/v1/automation":                   false,
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
		"/api/v1/automation/import_flow":      false,
		"/api/v1/automation/get_flow":         false,
		"/api/v1/automation/update_flow":      false,
		"/api/v1/automation/delete_flow":      false,
		"/api/v1/automation/list_flow_nodes":  false,
		"/api/v1/automation/get_flow_graph":   false,
		"/api/v1/automation/trigger_flow":     false,
	}

	for _, route := range client.engine.Routes() {
		expected_method := http.MethodPost
		if route.Path == "/ws/v1/automation" {
			expected_method = http.MethodGet
		}
		if route.Method != expected_method {
			t.Fatalf("automation route %s uses %s, want %s", route.Path, route.Method, expected_method)
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

func TestTriggerFlowManuallyRunsCronFlow(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := velo.NewApp(&velo.VeloAppOpt{Mode: velo.ModeHttp})
	db_path := filepath.Join(t.TempDir(), "automation-api.db")
	if err := app.Migrate(&velo.VeloDatabaseOpt{
		DBType:                    velo.DBTypeSQLite,
		DBPath:                    database.SQLiteDSN(db_path),
		Migrations:                &database.Migrations,
		DisableTimestampCallbacks: true,
	}); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	if err := database.ConfigureSQLiteRuntime(app.DB); err != nil {
		t.Fatalf("configure database: %v", err)
	}
	automation_service := services.NewAutomationService(
		app.DB,
		nil,
		flowengine.NewWorkflowEngine(),
		nil,
	)
	defer automation_service.Stop()
	flow, err := automation_service.CreateUserFlow(services.CreateUserFlowInput{
		Name:        "Cron API 调试流程",
		TriggerType: model.FlowRunTriggerCron,
	})
	if err != nil {
		t.Fatalf("create Cron flow: %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/v1/automation/trigger_flow",
		strings.NewReader(`{"id":"`+flow.ID+`"}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")
	client := &APIClient{automation_service: automation_service}
	client.handle_trigger_user_flow(ctx)

	var response struct {
		Code int             `json:"code"`
		Msg  string          `json:"msg"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Code != 0 {
		t.Fatalf("trigger flow code = %d: %s", response.Code, response.Msg)
	}
	var run model.FlowRunRecord
	if err := json.Unmarshal(response.Data, &run); err != nil {
		t.Fatalf("decode run: %v", err)
	}
	if run.FlowID != flow.ID || run.TriggerType != model.FlowRunTriggerManual {
		t.Fatalf("unexpected manual run: %+v", run)
	}
	if run.Status != model.FlowRunStatusCompleted {
		t.Fatalf("run status = %s, want COMPLETED: %s", run.Status, run.Error)
	}
}
