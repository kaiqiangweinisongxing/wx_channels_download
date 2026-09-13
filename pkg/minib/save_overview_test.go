package minib

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"wx_channel/pkg/cookies"
)

func TestSaveBigmodelOverview(t *testing.T) {
	if !bigmodel_cookies_available(t) {
		t.Skip("no bigmodel.cn cookies in workdir/cookies.json")
	}

	browser, err := NewMiniBrowser(3*time.Minute, cookies.NewPersistentReader(bigmodel_workdir))
	if err != nil {
		t.Fatal(err)
	}
	defer browser.Close()

	token := strings.TrimSpace(os.Getenv("BIGMODEL_TOKEN"))
	ctx := with_request_header_modifier(context.Background(), func(request *http.Request) error {
		if !strings.HasSuffix(request.URL.Host, "bigmodel.cn") {
			return nil
		}
		if token != "" {
			request.Header.Set("Authorization", token)
		}
		request.Header.Set("Bigmodel-Organization", bigmodel_organization)
		request.Header.Set("Bigmodel-Project", bigmodel_project)
		return nil
	})

	page, err := browser.Navigate(ctx, "https://bigmodel.cn/coding-plan/personal/overview", nil, NavigateOptions{
		ResourceTimeout:   15 * time.Second,
		JavaScriptTimeout: 8 * time.Second,
		DisableImages:     true,
		DisableMedia:      true,
		LocalStorage: map[string]string{
			"inviteDialogLastShowTime": fmt.Sprintf("%d", time.Now().UnixMilli()),
		},
	})
	if err != nil {
		t.Fatalf("navigate: %v", err)
	}

	outDir := filepath.Join("..", "..", "workdir")
	_ = os.MkdirAll(outDir, 0755)
	outPath := filepath.Join(outDir, "overview_rendered.html")
	if err := os.WriteFile(outPath, []byte(page.RenderedHTML), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	for _, f := range page.ScriptFailures {
		t.Logf("script failure: %s: %v", f.URL, f.Err)
	}
	for _, r := range page.Resources {
		if r.Err != nil {
			t.Logf("resource failure: %s: %v", r.URL, r.Err)
		}
	}

	t.Logf("saved %d bytes to %s", len(page.RenderedHTML), outPath)
	widths := strings.Count(page.RenderedHTML, `class="progress-bar-value`)
	percents := strings.Count(page.RenderedHTML, `class="percentage-value`)
	t.Logf("found %d progress-bar-value and %d percentage-value", widths, percents)
	t.Logf("invite dialog markers: %d, iframe probe markers: %d",
		strings.Count(page.RenderedHTML, "邀请海报"), strings.Count(page.RenderedHTML, "mmMwWLliI0O"))

	if strings.Contains(page.RenderedHTML, `width: 0%`) && strings.Contains(page.RenderedHTML, `percentage-value">0<`) {
		t.Logf("WARNING: some bars may still be at 0%%")
	} else {
	t.Logf("bars appear to have animated (no 0%% widths with 0%% text)")
		}
	_ = fmt.Sprint(page.StatusCode)
}

// TestSaveBigmodelConsoleOverview saves the authenticated
// https://bigmodel.cn/console/overview page with the simulated PC viewport so
// its el-table columns distribute across the measured container width instead
// of collapsing to their configured minimums.
func TestSaveBigmodelConsoleOverview(t *testing.T) {
	if !bigmodel_cookies_available(t) {
		t.Skip("no bigmodel.cn cookies in workdir/cookies.json")
	}

	browser, err := NewMiniBrowser(3*time.Minute, cookies.NewPersistentReader(bigmodel_workdir))
	if err != nil {
		t.Fatal(err)
	}
	defer browser.Close()

	token := strings.TrimSpace(os.Getenv("BIGMODEL_TOKEN"))
	ctx := with_request_header_modifier(context.Background(), func(request *http.Request) error {
		if !strings.HasSuffix(request.URL.Host, "bigmodel.cn") {
			return nil
		}
		if token != "" {
			request.Header.Set("Authorization", token)
		}
		request.Header.Set("Bigmodel-Organization", bigmodel_organization)
		request.Header.Set("Bigmodel-Project", bigmodel_project)
		return nil
	})

	page, err := browser.Navigate(ctx, "https://bigmodel.cn/console/overview", nil, NavigateOptions{
		Device:            DevicePC,
		ResourceTimeout:   15 * time.Second,
		JavaScriptTimeout: 8 * time.Second,
		DisableImages:     true,
		DisableMedia:      true,
		LocalStorage: map[string]string{
			"inviteDialogLastShowTime": fmt.Sprintf("%d", time.Now().UnixMilli()),
		},
	})
	if err != nil {
		t.Fatalf("navigate: %v", err)
	}
	for _, message := range page.ConsoleMessages {
		t.Logf("console: %s", message)
	}
	t.Logf("XHR requests (%d):", len(page.XHRRequests))
	for _, request := range page.XHRRequests {
		t.Logf("  xhr: %s", request)
	}
	t.Logf("fetch requests (%d):", len(page.FetchRequests))
	for _, request := range page.FetchRequests {
		t.Logf("  fetch: %s", request)
	}

	outDir := filepath.Join("..", "..", "workdir")
	_ = os.MkdirAll(outDir, 0755)
	outPath := filepath.Join(outDir, "console_overview_rendered.html")
	if err := os.WriteFile(outPath, []byte(page.RenderedHTML), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	for _, f := range page.ScriptFailures {
		t.Logf("script failure: %s: %v", f.URL, f.Err)
	}
	for _, r := range page.Resources {
		if r.Err != nil {
			t.Logf("resource failure: %s: %v", r.URL, r.Err)
		}
	}

	t.Logf("saved %d bytes to %s (final URL %s)", len(page.RenderedHTML), outPath, page.URL)
	for _, table := range regexp.MustCompile(`<table[^>]*style="width: ([0-9.]+)px"`).FindAllStringSubmatch(page.RenderedHTML, -1) {
		t.Logf("table width: %spx", table[1])
	}
}
