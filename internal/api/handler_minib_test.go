package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"

	"wx_channel/pkg/minib"
)

type minib_test_envelope struct {
	Code int             `json:"code"`
	Msg  string          `json:"msg"`
	Data json.RawMessage `json:"data"`
}

func run_minib_handler_test(t *testing.T, client *APIClient, body string) minib_test_envelope {
	t.Helper()
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/minib/navigate", strings.NewReader(body))
	ctx.Request.Header.Set("Content-Type", "application/json")
	client.handle_minib_navigate(ctx)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	var response minib_test_envelope
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return response
}

func TestHandleMinibNavigateRejectsUnsupportedURL(t *testing.T) {
	called := false
	client := &APIClient{
		minib_navigate: func(context.Context, string) (*minib_navigation_response, error) {
			called = true
			return nil, nil
		},
	}
	response := run_minib_handler_test(t, client, `{"url":"file:///tmp/private"}`)
	if response.Code != 400 {
		t.Fatalf("code = %d, want 400", response.Code)
	}
	if called {
		t.Fatal("navigator should not be called for unsupported URL")
	}
}

func TestHandleMinibNavigateReturnsNavigationResult(t *testing.T) {
	logger := zerolog.Nop()
	client := &APIClient{
		logger: &logger,
		minib_navigate: func(_ context.Context, navigation_url string) (*minib_navigation_response, error) {
			if navigation_url != "https://example.com/path" {
				t.Fatalf("url = %q", navigation_url)
			}
			return &minib_navigation_response{
				URL:          navigation_url,
				StatusCode:   200,
				RenderedHTML: "<html><body>ready</body></html>",
				Network: []minib_network_entry{
					{Method: "GET", URL: navigation_url, Status: 200},
				},
				ConsoleMessages: []minib_console_message{
					{Level: "log", Text: "ready"},
				},
			}, nil
		},
	}
	response := run_minib_handler_test(t, client, `{"url":" https://example.com/path "}`)
	if response.Code != 0 {
		t.Fatalf("code = %d, msg = %q", response.Code, response.Msg)
	}
	var data minib_navigation_response
	if err := json.Unmarshal(response.Data, &data); err != nil {
		t.Fatalf("decode data: %v", err)
	}
	if data.RenderedHTML != "<html><body>ready</body></html>" {
		t.Fatalf("rendered_html = %q", data.RenderedHTML)
	}
	if len(data.Network) != 1 || len(data.ConsoleMessages) != 1 {
		t.Fatalf("unexpected result: %#v", data)
	}
}

func TestHandleMinibNavigateReportsNavigationFailure(t *testing.T) {
	logger := zerolog.Nop()
	client := &APIClient{
		logger: &logger,
		minib_navigate: func(context.Context, string) (*minib_navigation_response, error) {
			return nil, errors.New("timeout")
		},
	}
	response := run_minib_handler_test(t, client, `{"url":"https://example.com"}`)
	if response.Code != 500 {
		t.Fatalf("code = %d, want 500", response.Code)
	}
	if !strings.Contains(response.Msg, "timeout") {
		t.Fatalf("msg = %q", response.Msg)
	}
}

func TestSummarizeMinibHARExcludesSensitiveFields(t *testing.T) {
	har_data := []byte(`{
		"log":{"entries":[{
			"startedDateTime":"2026-09-13T10:00:00Z",
			"time":42.5,
			"request":{"method":"POST","url":"https://example.com/api","headers":[{"name":"Authorization","value":"secret"}]},
			"response":{"status":201,"statusText":"Created","bodySize":-1,"content":{"size":128,"mimeType":"application/json","text":"private"}},
			"_resourceType":"fetch","_fromCache":"memory"
		}]}
	}`)
	entries, err := summarize_minib_har(har_data)
	if err != nil {
		t.Fatalf("summarize HAR: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("entries = %d, want 1", len(entries))
	}
	entry := entries[0]
	if entry.BodySize != 128 || !entry.FromCache || entry.ResourceType != "fetch" {
		t.Fatalf("entry = %#v", entry)
	}
	encoded, err := json.Marshal(entry)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "secret") || strings.Contains(string(encoded), "private") {
		t.Fatalf("sensitive HAR values leaked: %s", encoded)
	}
}

func TestCollectMinibConsoleMessagesIncludesScriptFailures(t *testing.T) {
	page := &minib.Page{
		ConsoleMessages: []string{"warn: slow request", "plain message", "unhandled rejection: broken promise"},
		ScriptFailures: []minib.ScriptFailure{
			{URL: "https://example.com/app.js", Err: errors.New("syntax error")},
		},
	}
	messages := collect_minib_console_messages(page)
	if len(messages) != 4 {
		t.Fatalf("messages = %d, want 4", len(messages))
	}
	if messages[0].Level != "warn" || messages[0].Text != "slow request" {
		t.Fatalf("first message = %#v", messages[0])
	}
	if messages[2].Level != "error" || messages[2].Text != "broken promise" {
		t.Fatalf("unhandled rejection = %#v", messages[2])
	}
	if messages[3].Level != "error" || messages[3].URL == "" {
		t.Fatalf("script failure = %#v", messages[3])
	}
}
