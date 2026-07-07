use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub domain: String,
    pub title: String,
    pub status: String,
    pub default_mode: Option<String>,
    pub current_leaf_message_id: Option<String>,
    pub project_id: Option<String>,
    pub document_id: Option<String>,
    pub memory_scope_id: String,
    pub summary: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_opened_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionInput {
    pub domain: String,
    pub title: Option<String>,
    pub default_mode: Option<String>,
    pub project_id: Option<String>,
    pub document_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSessionInput {
    pub title: Option<String>,
    pub status: Option<String>,
    pub default_mode: Option<String>,
    pub current_leaf_message_id: Option<String>,
    pub project_id: Option<String>,
    pub document_id: Option<String>,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub parent_message_id: Option<String>,
    pub agent_run_id: Option<String>,
    pub role: String,
    pub content: String,
    pub tool_name: Option<String>,
    pub tool_payload: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMessageInput {
    pub session_id: String,
    pub parent_message_id: Option<String>,
    pub agent_run_id: Option<String>,
    pub role: String,
    pub content: String,
    pub tool_name: Option<String>,
    pub tool_payload: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRun {
    pub id: String,
    pub session_id: String,
    pub parent_message_id: Option<String>,
    pub user_message_id: String,
    pub assistant_message_id: Option<String>,
    pub mode: String,
    pub status: String,
    pub toolset_snapshot_json: Option<String>,
    pub permission_snapshot_json: Option<String>,
    pub created_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentRunInput {
    pub session_id: String,
    pub parent_message_id: Option<String>,
    pub user_message_id: String,
    pub mode: String,
    pub toolset_snapshot_json: Option<String>,
    pub permission_snapshot_json: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAgentRunInput {
    pub assistant_message_id: Option<String>,
    pub status: Option<String>,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceColumn {
    pub id: String,
    pub run_id: String,
    pub session_id: String,
    pub kind: String,
    pub label: String,
    pub status: String,
    pub parent_column_id: Option<String>,
    pub tools_json: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertTraceColumnInput {
    pub id: String,
    pub run_id: String,
    pub session_id: String,
    pub kind: String,
    pub label: String,
    pub status: String,
    pub parent_column_id: Option<String>,
    pub tools_json: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceMessage {
    pub id: String,
    pub run_id: String,
    pub column_id: String,
    pub iteration: i64,
    pub idx: i64,
    pub role: String,
    pub content: Option<String>,
    pub tool_calls_json: Option<String>,
    pub tool_call_id: Option<String>,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertTraceMessageInput {
    pub id: String,
    pub run_id: String,
    pub column_id: String,
    pub iteration: i64,
    pub idx: i64,
    pub role: String,
    pub content: Option<String>,
    pub tool_calls_json: Option<String>,
    pub tool_call_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceRun {
    pub columns: Vec<TraceColumn>,
    pub messages: Vec<TraceMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeProject {
    pub id: String,
    pub path: String,
    pub display_name: String,
    pub created_at: String,
    pub last_opened_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WritingDocument {
    pub id: String,
    pub title: String,
    pub file_path: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWritingDocumentInput {
    pub title: String,
    pub initial_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolRun {
    pub id: String,
    pub session_id: String,
    pub run_id: Option<String>,
    pub message_id: Option<String>,
    pub kind: String,
    pub command: Option<String>,
    pub cwd: Option<String>,
    pub target_path: Option<String>,
    pub status: String,
    pub exit_code: Option<i64>,
    pub stdout_tail: Option<String>,
    pub stderr_tail: Option<String>,
    pub requires_confirmation: bool,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryItem {
    pub id: String,
    pub domain: String,
    pub layer: String,
    pub session_id: Option<String>,
    pub content: String,
    pub metadata: Option<serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddMemoryInput {
    pub domain: String,
    pub layer: String,
    pub content: String,
    pub session_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMemoryInput {
    pub content: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub layer: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryScope {
    pub domain: String,
    pub session_id: Option<String>,
    pub layer: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryQuery {
    pub domain: String,
    pub query: String,
    pub session_id: Option<String>,
    pub layer: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub onboarding_completed: bool,
    pub has_api_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmToolFunction {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmToolDefinition {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: LlmToolFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmToolCallFunction {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: LlmToolCallFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmMessage {
    pub role: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<LlmToolCall>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmCompletionInput {
    pub messages: Vec<LlmMessage>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub tools: Option<Vec<LlmToolDefinition>>,
    pub tool_choice: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmCompletionResult {
    #[serde(default)]
    pub content: String,
    pub model: String,
    pub usage: Option<LlmUsage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<LlmToolCall>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmStreamChunk {
    pub delta: String,
    pub done: bool,
    pub usage: Option<LlmUsage>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellRunRequest {
    pub session_id: String,
    pub project_path: String,
    pub mode: String,
    pub command: String,
    pub cwd: Option<String>,
    pub confirmed: Option<bool>,
    pub run_id: Option<String>,
    pub message_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellRunResult {
    pub tool_run: ToolRun,
    pub blocked_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReadRequest {
    pub session_id: String,
    pub project_path: String,
    pub mode: String,
    pub relative_path: String,
    pub run_id: Option<String>,
    pub message_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteRequest {
    pub session_id: String,
    pub project_path: String,
    pub mode: String,
    pub relative_path: String,
    pub content: String,
    pub confirmed: Option<bool>,
    pub run_id: Option<String>,
    pub message_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionActionRequest {
    pub document_id: String,
    pub action: String,
    pub selection_text: String,
    pub surrounding_context: Option<String>,
    pub tone: Option<String>,
    pub target_language: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionActionResult {
    pub action: String,
    pub output: String,
}
