package cmd

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"wx_channel/pkg/cookies"
	"wx_channel/pkg/minib"
)

const fetch_default_timeout = 90 * time.Second

type fetch_navigate_function func(context.Context, string, string, time.Duration) (string, error)

var (
	fetch_output_path string
	fetch_timeout     time.Duration
	fetch_navigate    fetch_navigate_function = fetch_with_minib
)

var fetch_cmd = &cobra.Command{
	Use:   "fetch <url>",
	Short: "使用 Minib 访问页面并保存渲染后的 HTML",
	Long: "使用 Minib 访问页面、执行页面脚本，并将最终渲染的 HTML 写入本地文件。" +
		"默认读取 config.yaml，并使用 <workdir>/cookies.json 中与目标 URL 匹配的 Cookie。",
	Example: `  wx_video_download fetch "https://example.com" -o "saved.html"
  wx_video_download fetch "https://example.com" -o "saved.html" --timeout 2m
  wx_video_download --config "/path/to/config.yaml" fetch "https://example.com" -o "saved.html"`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		output_path := strings.TrimSpace(fetch_output_path)
		if output_path == "" {
			return errors.New("必须通过 -o 或 --output 指定 HTML 输出文件")
		}
		work_dir := ""
		if Cfg != nil {
			work_dir = strings.TrimSpace(Cfg.WorkDir)
		}

		result, err := fetch_to_file(
			cmd.Context(),
			fetch_navigate,
			args[0],
			output_path,
			work_dir,
			fetch_timeout,
		)
		if err != nil {
			return err
		}
		fmt.Fprintf(
			cmd.OutOrStdout(),
			"已保存 %s（%d bytes）\n",
			result.output_path,
			result.size,
		)
		return nil
	},
	SilenceErrors: true,
	SilenceUsage:  true,
}

type fetch_file_result struct {
	output_path string
	size        int
}

func init() {
	fetch_cmd.Flags().StringVarP(
		&fetch_output_path,
		"output",
		"o",
		"",
		"渲染后 HTML 的输出文件",
	)
	fetch_cmd.Flags().DurationVar(
		&fetch_timeout,
		"timeout",
		fetch_default_timeout,
		"页面导航超时时间",
	)
	root_cmd.AddCommand(fetch_cmd)
}

func fetch_to_file(
	ctx context.Context,
	navigate fetch_navigate_function,
	raw_url string,
	output_path string,
	work_dir string,
	timeout time.Duration,
) (*fetch_file_result, error) {
	navigation_url, err := normalize_fetch_url(raw_url)
	if err != nil {
		return nil, err
	}
	if navigate == nil {
		return nil, errors.New("Minib 导航器不可用")
	}
	if timeout <= 0 {
		timeout = fetch_default_timeout
	}

	navigation_context, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	rendered_html, err := navigate(navigation_context, navigation_url, work_dir, timeout)
	if err != nil {
		return nil, fmt.Errorf("Minib 访问失败: %w", err)
	}

	resolved_output_path, err := filepath.Abs(strings.TrimSpace(output_path))
	if err != nil {
		return nil, fmt.Errorf("解析输出路径失败: %w", err)
	}
	if err := os.WriteFile(resolved_output_path, []byte(rendered_html), 0644); err != nil {
		return nil, fmt.Errorf("写入 HTML 文件失败: %w", err)
	}
	return &fetch_file_result{
		output_path: resolved_output_path,
		size:        len([]byte(rendered_html)),
	}, nil
}

func fetch_with_minib(ctx context.Context, navigation_url string, work_dir string, timeout time.Duration) (string, error) {
	cookie_reader := cookies.NewPersistentReader(work_dir)
	browser, err := minib.NewMiniBrowser(timeout, cookie_reader)
	if err != nil {
		return "", fmt.Errorf("创建 Minib 实例: %w", err)
	}
	defer browser.Close()

	page, err := browser.Navigate(ctx, navigation_url, nil, minib.NavigateOptions{
		JavaScriptTimeout: 20 * time.Second,
		ResourceTimeout:   20 * time.Second,
		WaitUntil:         minib.WaitUntilLoad,
	})
	if err != nil {
		return "", err
	}
	return page.RenderedHTML, nil
}

func normalize_fetch_url(raw_url string) (string, error) {
	normalized := strings.TrimSpace(raw_url)
	if normalized == "" {
		return "", errors.New("URL 不能为空")
	}
	parsed_url, err := url.Parse(normalized)
	if err != nil || parsed_url.Host == "" {
		return "", errors.New("请输入有效的 HTTP 或 HTTPS URL")
	}
	if parsed_url.Scheme != "http" && parsed_url.Scheme != "https" {
		return "", errors.New("仅支持 HTTP 或 HTTPS URL")
	}
	return parsed_url.String(), nil
}
