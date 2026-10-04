#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde_json::Value;
use std::{path::PathBuf, process::Stdio};
use tauri::Manager;
use tokio::{io::AsyncWriteExt, process::Command, sync::Mutex};
struct GameLock(Mutex<()>);
fn node() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut candidates: Vec<PathBuf> = [
        ".local/share/fnm/aliases/default/bin/node",
        ".volta/bin/node",
        ".local/bin/node",
    ]
    .iter()
    .map(|p| PathBuf::from(&home).join(p))
    .collect();
    candidates.extend([
        PathBuf::from("/opt/homebrew/bin/node"),
        PathBuf::from("/usr/local/bin/node"),
    ]);
    if let Some(path) = std::env::var_os("PATH") {
        candidates.extend(
            std::env::split_paths(&path)
                .filter(|p| p.is_absolute())
                .map(|p| p.join("node")),
        );
    }
    candidates
        .into_iter()
        .find(|p| p.is_file())
        .ok_or("Install Node.js 24 or newer to run the local GM.".into())
}
#[tauri::command]
async fn game_command(
    app: tauri::AppHandle,
    lock: tauri::State<'_, GameLock>,
    command: Value,
) -> Result<Value, String> {
    let _guard = lock
        .0
        .try_lock()
        .map_err(|_| "A game action is already running.")?;
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
    let resources = if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources")
    } else {
        app.path().resource_dir().map_err(|e| e.to_string())?
    };
    let mut child = Command::new(node()?)
        .arg(resources.join("runtime.cjs"))
        .arg(data.join("adventure.sqlite"))
        .current_dir(&data)
        .env_clear()
        .envs(
            ["HOME", "PATH", "USER", "LOGNAME", "LANG", "TMPDIR"]
                .iter()
                .filter_map(|key| std::env::var(key).ok().map(|value| (*key, value))),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Could not start the local GM: {e}"))?;
    let mut stdin = child.stdin.take().ok_or("Missing game input pipe")?;
    stdin
        .write_all(format!("{}\n", command).as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    drop(stdin);
    let output = child.wait_with_output().await.map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("The local GM stopped. Node.js 24 or newer is required. Reopen the saved adventure and retry.".into());
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|_| "The local GM returned an unreadable response.".into())
}
#[tauri::command]
fn render_report(app: tauri::AppHandle, report: Value) -> Result<(), String> {
    if std::env::var_os("D20_RENDER_REPORT").is_some() {
        let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::write(dir.join("render-report.json"), report.to_string())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn main() {
    tauri::Builder::default()
        .manage(GameLock(Mutex::new(())))
        .invoke_handler(tauri::generate_handler![game_command, render_report])
        .run(tauri::generate_context!())
        .expect("D20 Adventures failed to start");
}
