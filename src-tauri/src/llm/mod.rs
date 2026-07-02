use crate::models::{
    LlmCompletionInput, LlmCompletionResult, LlmMessage, LlmStreamChunk, LlmToolCall,
    LlmToolDefinition, LlmUsage, SelectionActionRequest, SelectionActionResult,
};
use crate::settings;

const DEFAULT_MODEL: &str = "deepseek-v4-pro";
const DEEPSEEK_URL: &str = "https://api.deepseek.com/chat/completions";

/// DeepSeek uses the OpenAI chat format (snake_case fields like `tool_call_id`).
fn messages_to_api_json(messages: &[LlmMessage]) -> Vec<serde_json::Value> {
    messages.iter().map(message_to_api_json).collect()
}

fn message_to_api_json(message: &LlmMessage) -> serde_json::Value {
    let mut obj = serde_json::Map::new();
    obj.insert("role".to_string(), serde_json::json!(message.role));

    match &message.content {
        Some(content) => {
            obj.insert("content".to_string(), serde_json::json!(content));
        }
        None if message.tool_calls.is_some() => {
            obj.insert("content".to_string(), serde_json::Value::Null);
        }
        None => {}
    }

    if let Some(tool_calls) = &message.tool_calls {
        obj.insert(
            "tool_calls".to_string(),
            serde_json::json!(tool_calls
                .iter()
                .map(tool_call_to_api_json)
                .collect::<Vec<_>>()),
        );
    }

    if let Some(tool_call_id) = &message.tool_call_id {
        obj.insert(
            "tool_call_id".to_string(),
            serde_json::json!(tool_call_id),
        );
    }

    serde_json::Value::Object(obj)
}

fn tool_call_to_api_json(tool_call: &LlmToolCall) -> serde_json::Value {
    serde_json::json!({
        "id": tool_call.id,
        "type": tool_call.call_type,
        "function": {
            "name": tool_call.function.name,
            "arguments": tool_call.function.arguments,
        }
    })
}

fn tools_to_api_json(tools: &[LlmToolDefinition]) -> Vec<serde_json::Value> {
    tools
        .iter()
        .map(|tool| {
            serde_json::json!({
                "type": tool.tool_type,
                "function": {
                    "name": tool.function.name,
                    "description": tool.function.description,
                    "parameters": tool.function.parameters,
                }
            })
        })
        .collect()
}

#[derive(serde::Deserialize)]
struct DeepSeekResponse {
    choices: Vec<DeepSeekChoice>,
    model: Option<String>,
    usage: Option<DeepSeekUsage>,
}

#[derive(serde::Deserialize)]
struct DeepSeekChoice {
    message: DeepSeekMessage,
    finish_reason: Option<String>,
}

#[derive(serde::Deserialize)]
struct DeepSeekMessage {
    content: Option<String>,
    tool_calls: Option<Vec<LlmToolCall>>,
}

#[derive(serde::Deserialize)]
struct DeepSeekUsage {
    prompt_tokens: Option<u32>,
    completion_tokens: Option<u32>,
    total_tokens: Option<u32>,
}

#[tauri::command]
pub async fn llm_complete(input: LlmCompletionInput) -> Result<LlmCompletionResult, String> {
    let api_key =
        settings::get_api_key()?.ok_or_else(|| "DeepSeek API key is not configured".to_string())?;
    let model = input.model.unwrap_or_else(|| DEFAULT_MODEL.to_string());

    let client = reqwest::Client::new();
    let mut body = serde_json::json!({
        "model": model,
        "messages": messages_to_api_json(&input.messages),
        "temperature": input.temperature.unwrap_or(0.7),
        "stream": false
    });
    if let Some(max_tokens) = input.max_tokens {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }
    if let Some(tools) = input.tools {
        body["tools"] = serde_json::json!(tools_to_api_json(&tools));
    }
    if let Some(tool_choice) = input.tool_choice {
        body["tool_choice"] = tool_choice;
    }

    let response = client
        .post(DEEPSEEK_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&error_body) {
            if let Some(message) = json.pointer("/error/message").and_then(|value| value.as_str()) {
                return Err(format!("DeepSeek API error ({status}): {message}"));
            }
        }
        return Err(format!("DeepSeek request failed ({status}): {error_body}"));
    }

    let payload: DeepSeekResponse = response.json().await.map_err(|err| err.to_string())?;
    let choice = payload.choices.first();
    let message = choice.map(|item| &item.message);
    let content = message
        .and_then(|item| item.content.clone())
        .unwrap_or_default();
    let tool_calls = message.and_then(|item| item.tool_calls.clone());
    let finish_reason = choice.and_then(|item| item.finish_reason.clone());

    Ok(LlmCompletionResult {
        content,
        model: payload.model.unwrap_or(model),
        usage: payload.usage.map(|usage| LlmUsage {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
        }),
        tool_calls,
        finish_reason,
    })
}

#[tauri::command]
pub async fn llm_stream(input: LlmCompletionInput) -> Result<Vec<LlmStreamChunk>, String> {
    let result = llm_complete(input).await?;
    Ok(vec![
        LlmStreamChunk {
            delta: result.content.clone(),
            done: false,
            usage: result.usage.clone(),
        },
        LlmStreamChunk {
            delta: String::new(),
            done: true,
            usage: result.usage,
        },
    ])
}

#[tauri::command]
pub async fn writing_selection_action(
    request: SelectionActionRequest,
) -> Result<SelectionActionResult, String> {
    let prompt = build_selection_prompt(&request);
    let result = llm_complete(LlmCompletionInput {
        messages: vec![
            crate::models::LlmMessage {
                role: "system".to_string(),
                content: Some(
                    "You are a precise writing assistant. Return only the transformed text."
                        .to_string(),
                ),
                tool_calls: None,
                tool_call_id: None,
            },
            crate::models::LlmMessage {
                role: "user".to_string(),
                content: Some(prompt),
                tool_calls: None,
                tool_call_id: None,
            },
        ],
        model: Some(DEFAULT_MODEL.to_string()),
        temperature: Some(0.4),
        max_tokens: Some(1200),
        tools: None,
        tool_choice: None,
    })
    .await?;

    Ok(SelectionActionResult {
        action: request.action,
        output: result.content,
    })
}

fn build_selection_prompt(request: &SelectionActionRequest) -> String {
    let context = request
        .surrounding_context
        .clone()
        .unwrap_or_default();
    match request.action.as_str() {
        "translateSelection" => format!(
            "Translate the following selection into {}. Selection:\n{}\n\nContext:\n{}",
            request
                .target_language
                .clone()
                .unwrap_or_else(|| "English".to_string()),
            request.selection_text,
            context
        ),
        "adjustTone" => format!(
            "Adjust the tone to {} while preserving meaning. Selection:\n{}\n\nContext:\n{}",
            request
                .tone
                .clone()
                .unwrap_or_else(|| "clear and concise".to_string()),
            request.selection_text,
            context
        ),
        "rewriteSelection" => format!(
            "Rewrite the selection for clarity. Selection:\n{}\n\nContext:\n{}",
            request.selection_text, context
        ),
        "continueWriting" => format!(
            "Continue writing naturally from this context:\n{}\n\nRecent selection or tail:\n{}",
            context, request.selection_text
        ),
        _ => request.selection_text.clone(),
    }
}
