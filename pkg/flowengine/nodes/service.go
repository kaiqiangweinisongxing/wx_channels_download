package nodes

import (
	"context"
	"fmt"
	"strings"
	"time"

	"wx_channel/pkg/flowengine/engine"
)

const default_service_output_key = "service_result"

// ServiceToolExecutor runs one named service tool with JSON-compatible
// arguments and returns its structured output.
type ServiceToolExecutor func(context.Context, string, map[string]any) (any, error)

// ServiceNode invokes a tool exposed by the process-local MCP server.
type ServiceNode struct {
	node_id  string
	Config   map[string]interface{}
	executor ServiceToolExecutor
}

// NewServiceNodeFactory binds a service executor to a flow-engine node
// constructor. Keeping the executor on the engine avoids process-wide state.
func NewServiceNodeFactory(executor ServiceToolExecutor) func(map[string]interface{}) engine.Node {
	return func(config map[string]interface{}) engine.Node {
		id, _ := config["id"].(string)
		return &ServiceNode{node_id: id, Config: config, executor: executor}
	}
}

func (n *ServiceNode) ID() string   { return n.node_id }
func (n *ServiceNode) Type() string { return "ServiceNode" }

func (n *ServiceNode) Execute(process_context *engine.ProcessContext) (bool, []string, error) {
	if n.executor == nil {
		return false, nil, fmt.Errorf("service executor is not configured")
	}
	tool_name, _ := n.Config["tool_name"].(string)
	tool_name = strings.TrimSpace(tool_name)
	if tool_name == "" {
		return false, nil, fmt.Errorf("missing tool_name")
	}

	arguments, err := service_arguments(n.Config, process_context)
	if err != nil {
		return false, nil, err
	}
	execution_context := context.Background()
	cancel := func() {}
	if timeout_seconds := service_timeout_seconds(n.Config); timeout_seconds > 0 {
		execution_context, cancel = context.WithTimeout(execution_context, time.Duration(timeout_seconds)*time.Second)
	}
	defer cancel()

	result, err := n.executor(execution_context, tool_name, arguments)
	if err != nil {
		return false, nil, fmt.Errorf("service tool %s failed: %w", tool_name, err)
	}
	output_key := default_service_output_key
	if configured_key, ok := n.Config["output_key"].(string); ok && strings.TrimSpace(configured_key) != "" {
		output_key = strings.TrimSpace(configured_key)
	}
	process_context.Mu.Lock()
	process_context.Data[output_key] = result
	process_context.Mu.Unlock()

	next_ids := process_context.EngineRef.GetNextNodeIDsFromDefinition(process_context, n.node_id)
	return true, next_ids, nil
}

func service_arguments(config map[string]interface{}, process_context *engine.ProcessContext) (map[string]any, error) {
	arguments := map[string]any{}
	if configured_arguments, ok := config["arguments"]; ok && configured_arguments != nil {
		argument_map, ok := configured_arguments.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("service arguments must be an object")
		}
		for key, value := range argument_map {
			arguments[key] = value
		}
	}

	configured_input_map, ok := config["input_map"]
	if !ok || configured_input_map == nil {
		return arguments, nil
	}
	input_map, ok := configured_input_map.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("service input_map must be an object")
	}
	process_context.Mu.Lock()
	defer process_context.Mu.Unlock()
	for argument_name, context_key_value := range input_map {
		context_key, ok := context_key_value.(string)
		if !ok || strings.TrimSpace(context_key) == "" {
			return nil, fmt.Errorf("service input_map.%s must be a context key", argument_name)
		}
		value, exists := process_context.Data[context_key]
		if !exists {
			return nil, fmt.Errorf("service context value not found: %s", context_key)
		}
		arguments[argument_name] = value
	}
	return arguments, nil
}

func service_timeout_seconds(config map[string]interface{}) int {
	switch value := config["timeout_seconds"].(type) {
	case int:
		return value
	case int64:
		return int(value)
	case float64:
		return int(value)
	default:
		return 0
	}
}
