package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"wx_channel/internal/apiresult"
	"wx_channel/pkg/cookies"
	"wx_channel/pkg/minib"
)

const (
	minib_navigation_timeout = 90 * time.Second
	minib_script_timeout     = 20 * time.Second
	minib_resource_timeout   = 20 * time.Second
)

type minib_navigate_function func(context.Context, string) (*minib_navigation_response, error)

type minib_navigate_request struct {
	URL string `json:"url"`
}

type minib_navigation_response struct {
	URL                  string                  `json:"url"`
	StatusCode           int                     `json:"status_code"`
	ContentType          string                  `json:"content_type"`
	RenderedHTML         string                  `json:"rendered_html"`
	Network              []minib_network_entry   `json:"network"`
	ConsoleMessages      []minib_console_message `json:"console_messages"`
	NavigationHistory    []string                `json:"navigation_history"`
	ExecutedScripts      int                     `json:"executed_scripts"`
	DurationMilliseconds int64                   `json:"duration_ms"`
}

type minib_network_entry struct {
	Method       string  `json:"method"`
	URL          string  `json:"url"`
	Status       int     `json:"status"`
	StatusText   string  `json:"status_text"`
	ResourceType string  `json:"resource_type"`
	MIMEType     string  `json:"mime_type"`
	BodySize     int64   `json:"body_size"`
	Duration     float64 `json:"duration_ms"`
	StartedAt    string  `json:"started_at"`
	FromCache    bool    `json:"from_cache"`
	Error        string  `json:"error,omitempty"`
}

type minib_console_message struct {
	Level string `json:"level"`
	Text  string `json:"text"`
	URL   string `json:"url,omitempty"`
}

type minib_har_archive struct {
	Log struct {
		Entries []minib_har_entry `json:"entries"`
	} `json:"log"`
}

type minib_har_entry struct {
	StartedAt string  `json:"startedDateTime"`
	Duration  float64 `json:"time"`
	Request   struct {
		Method string `json:"method"`
		URL    string `json:"url"`
	} `json:"request"`
	Response struct {
		Status     int    `json:"status"`
		StatusText string `json:"statusText"`
		BodySize   int64  `json:"bodySize"`
		Content    struct {
			Size     int64  `json:"size"`
			MIMEType string `json:"mimeType"`
		} `json:"content"`
	} `json:"response"`
	ResourceType string `json:"_resourceType"`
	FromCache    string `json:"_fromCache"`
	Error        string `json:"_error"`
}

func (c *APIClient) handle_minib_navigate(ctx *gin.Context) {
	var request minib_navigate_request
	if err := ctx.ShouldBindJSON(&request); err != nil {
		apiresult.Err(ctx, 400, "请求参数错误")
		return
	}

	navigation_url, err := valid_minib_navigation_url(request.URL)
	if err != nil {
		apiresult.Err(ctx, 400, err.Error())
		return
	}

	navigate := c.minib_navigate
	if navigate == nil {
		work_dir := ""
		if c.cfg != nil {
			work_dir = c.cfg.WorkDir
		}
		navigate = new_minib_navigator(work_dir)
	}
	response, err := navigate(ctx.Request.Context(), navigation_url)
	if err != nil {
		c.logger.Error().Err(err).Str("url", navigation_url).Msg("minib navigation failed")
		apiresult.Err(ctx, 500, fmt.Sprintf("导航失败：%s", err))
		return
	}
	apiresult.Ok(ctx, response)
}

func valid_minib_navigation_url(raw_url string) (string, error) {
	normalized := strings.TrimSpace(raw_url)
	if normalized == "" {
		return "", errors.New("请输入要访问的链接")
	}
	parsed_url, err := url.Parse(normalized)
	if err != nil || parsed_url.Host == "" {
		return "", errors.New("请输入有效的 HTTP 或 HTTPS 链接")
	}
	if parsed_url.Scheme != "http" && parsed_url.Scheme != "https" {
		return "", errors.New("仅支持 HTTP 或 HTTPS 链接")
	}
	return parsed_url.String(), nil
}

func new_minib_navigator(work_dir string) minib_navigate_function {
	cookie_provider := cookies.NewPersistentReader(work_dir)
	return func(parent_context context.Context, navigation_url string) (*minib_navigation_response, error) {
		return navigate_with_minib(parent_context, navigation_url, cookie_provider)
	}
}

func navigate_with_minib(parent_context context.Context, navigation_url string, cookie_provider *cookies.Reader) (*minib_navigation_response, error) {
	navigation_context, cancel := context.WithTimeout(parent_context, minib_navigation_timeout)
	defer cancel()

	browser, err := minib.NewMiniBrowser(minib_navigation_timeout, cookie_provider)
	if err != nil {
		return nil, fmt.Errorf("创建 Minib 实例: %w", err)
	}
	defer browser.Close()

	started_at := time.Now()
	page, err := browser.Navigate(navigation_context, navigation_url, nil, minib.NavigateOptions{
		CaptureHAR:        true,
		HAROmitBodies:     true,
		JavaScriptTimeout: minib_script_timeout,
		ResourceTimeout:   minib_resource_timeout,
		WaitUntil:         minib.WaitUntilLoad,
	})
	if err != nil {
		return nil, err
	}

	har_data, err := page.HAR()
	if err != nil {
		return nil, fmt.Errorf("读取 Network 记录: %w", err)
	}
	network, err := summarize_minib_har(har_data)
	if err != nil {
		return nil, fmt.Errorf("解析 Network 记录: %w", err)
	}

	return &minib_navigation_response{
		URL:                  page.URL,
		StatusCode:           page.StatusCode,
		ContentType:          page.ContentType,
		RenderedHTML:         page.RenderedHTML,
		Network:              network,
		ConsoleMessages:      collect_minib_console_messages(page),
		NavigationHistory:    append([]string(nil), page.NavigationHistory...),
		ExecutedScripts:      page.ExecutedScripts,
		DurationMilliseconds: time.Since(started_at).Milliseconds(),
	}, nil
}

func summarize_minib_har(har_data []byte) ([]minib_network_entry, error) {
	archive := minib_har_archive{}
	if err := json.Unmarshal(har_data, &archive); err != nil {
		return nil, err
	}
	entries := make([]minib_network_entry, 0, len(archive.Log.Entries))
	for _, entry := range archive.Log.Entries {
		body_size := entry.Response.BodySize
		if body_size < 0 {
			body_size = entry.Response.Content.Size
		}
		entries = append(entries, minib_network_entry{
			Method:       entry.Request.Method,
			URL:          entry.Request.URL,
			Status:       entry.Response.Status,
			StatusText:   entry.Response.StatusText,
			ResourceType: entry.ResourceType,
			MIMEType:     entry.Response.Content.MIMEType,
			BodySize:     body_size,
			Duration:     entry.Duration,
			StartedAt:    entry.StartedAt,
			FromCache:    entry.FromCache != "",
			Error:        entry.Error,
		})
	}
	return entries, nil
}

func collect_minib_console_messages(page *minib.Page) []minib_console_message {
	messages := make([]minib_console_message, 0, len(page.ConsoleMessages)+len(page.ScriptFailures))
	for _, message := range page.ConsoleMessages {
		level, text := split_minib_console_message(message)
		messages = append(messages, minib_console_message{Level: level, Text: text})
	}
	for _, failure := range page.ScriptFailures {
		failure_text := "脚本加载或执行失败"
		if failure.Err != nil {
			failure_text = failure.Err.Error()
		}
		messages = append(messages, minib_console_message{
			Level: "error",
			Text:  failure_text,
			URL:   failure.URL,
		})
	}
	return messages
}

func split_minib_console_message(message string) (string, string) {
	text := strings.TrimSpace(message)
	if strings.HasPrefix(strings.ToLower(text), "unhandled rejection:") {
		return "error", strings.TrimSpace(text[len("unhandled rejection:"):])
	}
	separator_index := strings.Index(text, ":")
	if separator_index < 0 {
		return "log", text
	}
	level := strings.ToLower(strings.TrimSpace(text[:separator_index]))
	switch level {
	case "debug", "info", "log", "warn", "error":
		return level, strings.TrimSpace(text[separator_index+1:])
	default:
		return "log", text
	}
}
