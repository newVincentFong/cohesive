use crate::models::{
    LlmCompletionInput, LlmCompletionResult, LlmStreamChunk, LlmUsage, SelectionActionRequest,
    SelectionActionResult,
};
use crate::settings;

const DEFAULT_MODEL: &str = "deepseek-v4-pro";
const DEEPSEEK_URL: &str = "https://api.deepseek.com/chat/completions";

#[derive(serde::Deserialize)]
struct DeepSeekResponse {
    choices: Vec<DeepSeekChoice>,
    model: Option<String>,
    usage: Option<DeepSeekUsage>,
}

#[derive(serde::Deserialize)]
struct DeepSeekChoice {
    message: DeepSeekMessage,
}

#[derive(serde::Deserialize)]
struct DeepSeekMessage {
    content: String,
}

#[derive(serde::Deserialize)]
struct DeepSeekUsage {
    prompt_tokens: Option<u32>,
    completion_tokens: Option<u32>,
    total_tokens: Option<u32>,
}

#[tauri::command]
pub async fn llm_complete(input: LlmCompletionInput) -> Result<LlmCompletionResult, String> {
    let api_key = settings::get_api_key()?.ok_or_else(|| "DeepSeek API key is not configured".to_string())?;
    let model = input.model.unwrap_or_else(|| DEFAULT_MODEL.to_string());

    let client = reqwest::Client::new();
    let response = client
        .post(DEEPSEEK_URL)
        .bearer_auth(api_key)
        .json(&serde_json::json!({
            "model": model,
            "messages": input.messages,
            "temperature": input.temperature.unwrap_or(0.7),
            "max_tokens": input.max_tokens,
            "stream": false
        }))
        .send()
        .await
        .map_err(|err| err.to_string())?;

    if !response.status().is_success() {
        return Err(format!("DeepSeek request failed: {}", response.status()));
    }

    let payload: DeepSeekResponse = response.json().await.map_err(|err| err.to_string())?;
    let content = payload
        .choices
        .first()
        .map(|choice| choice.message.content.clone())
        .unwrap_or_default();

    Ok(LlmCompletionResult {
        content,
        model: payload.model.unwrap_or(model),
        usage: payload.usage.map(|usage| LlmUsage {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
        }),
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
                content: "You are a precise writing assistant. Return only the transformed text.".to_string(),
            },
            crate::models::LlmMessage {
                role: "user".to_string(),
                content: prompt,
            },
        ],
        model: Some(DEFAULT_MODEL.to_string()),
        temperature: Some(0.4),
        max_tokens: Some(1200),
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
