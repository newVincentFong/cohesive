use std::fs;
use std::path::Path;

use globset::{Glob, GlobSetBuilder};
use ignore::WalkBuilder;
use regex::Regex;

use crate::models::SearchMatch;

const MAX_FILE_BYTES: u64 = 1_048_576;

pub fn search_project(
    project_root: &Path,
    pattern: &str,
    include_glob: Option<&str>,
    case_insensitive: bool,
    max_results: usize,
) -> Result<Vec<SearchMatch>, String> {
    let regex = if case_insensitive {
        Regex::new(&format!("(?i){pattern}"))
    } else {
        Regex::new(pattern)
    }
    .map_err(|err| format!("Invalid regex pattern: {err}"))?;

    let include_matcher = if let Some(glob_pattern) = include_glob {
        let glob = Glob::new(glob_pattern).map_err(|err| err.to_string())?;
        Some(
            GlobSetBuilder::new()
                .add(glob)
                .build()
                .map_err(|err| err.to_string())?,
        )
    } else {
        None
    };

    let mut matches = Vec::new();
    let walker = WalkBuilder::new(project_root)
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .build();

    for entry in walker.flatten() {
        if matches.len() >= max_results {
            break;
        }

        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let metadata = match fs::metadata(path) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if metadata.len() > MAX_FILE_BYTES {
            continue;
        }

        let relative_path = path
            .strip_prefix(project_root)
            .map_err(|err| err.to_string())?
            .to_string_lossy()
            .replace('\\', "/");

        if let Some(matcher) = &include_matcher {
            if !matcher.is_match(&relative_path) {
                continue;
            }
        }

        let content = match fs::read_to_string(path) {
            Ok(value) => value,
            Err(_) => continue,
        };

        if content.contains('\0') {
            continue;
        }

        for (index, line) in content.lines().enumerate() {
            if matches.len() >= max_results {
                break;
            }
            if regex.is_match(line) {
                matches.push(SearchMatch {
                    relative_path: relative_path.clone(),
                    line_number: (index + 1) as i64,
                    line_content: line.to_string(),
                });
            }
        }
    }

    Ok(matches)
}

pub fn glob_project(
    project_root: &Path,
    pattern: &str,
    max_results: usize,
) -> Result<Vec<String>, String> {
    let glob = Glob::new(pattern).map_err(|err| err.to_string())?;
    let matcher = GlobSetBuilder::new()
        .add(glob)
        .build()
        .map_err(|err| err.to_string())?;

    let mut matched: Vec<(String, std::time::SystemTime)> = Vec::new();
    let walker = WalkBuilder::new(project_root)
        .hidden(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .build();

    for entry in walker.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let relative_path = path
            .strip_prefix(project_root)
            .map_err(|err| err.to_string())?
            .to_string_lossy()
            .replace('\\', "/");

        if !matcher.is_match(&relative_path) {
            continue;
        }

        let modified = fs::metadata(path)
            .and_then(|meta| meta.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);

        matched.push((relative_path, modified));
    }

    matched.sort_by(|left, right| right.1.cmp(&left.1));
    Ok(matched
        .into_iter()
        .take(max_results)
        .map(|(path, _)| path)
        .collect())
}

pub fn edit_file_content(
    content: &str,
    old_string: &str,
    new_string: &str,
    replace_all: bool,
) -> Result<String, String> {
    if old_string.is_empty() {
        return Err("oldString must not be empty".to_string());
    }

    let count = content.matches(old_string).count();
    if count == 0 {
        return Err(
            "oldString not found in file. Make sure you read the file first and copy the exact text including whitespace."
                .to_string(),
        );
    }

    if !replace_all && count > 1 {
        return Err(format!(
            "oldString appears {count} times in the file. Provide more surrounding context to make it unique, or set replaceAll to true."
        ));
    }

    if replace_all {
        Ok(content.replace(old_string, new_string))
    } else {
        Ok(content.replacen(old_string, new_string, 1))
    }
}
