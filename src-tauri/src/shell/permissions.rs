pub fn can_read_files(mode: &str) -> bool {
    matches!(mode, "plan" | "explore" | "build")
}

pub fn can_write_files(mode: &str) -> bool {
    mode == "build"
}

pub fn can_run_shell(mode: &str) -> bool {
    matches!(mode, "explore" | "build")
}

pub fn can_run_mutating_shell(mode: &str) -> bool {
    mode == "build"
}

pub fn is_mutating_command(command: &str) -> bool {
    let lowered = command.to_lowercase();
    let mutating_keywords = [
        "rm ", "mv ", "cp ", "mkdir", "touch", "npm install", "pnpm install", "yarn install",
        "cargo add", "git commit", "git push", "git reset", "git checkout", "sed -i", "tee ",
        "chmod", "chown", "> ", " >>",
    ];
    mutating_keywords.iter().any(|keyword| lowered.contains(keyword))
}

pub fn requires_confirmation(command: &str) -> bool {
    let lowered = command.to_lowercase();
    let dangerous = [
        "rm -rf", "git reset --hard", "git push --force", "sudo", "chmod -r", "drop table",
        ":(){", "mkfs", "dd if=",
    ];
    dangerous.iter().any(|keyword| lowered.contains(keyword))
}

pub fn requires_confirmation_for_write(relative_path: &str) -> bool {
    relative_path.contains("..") || relative_path.starts_with('/')
}
