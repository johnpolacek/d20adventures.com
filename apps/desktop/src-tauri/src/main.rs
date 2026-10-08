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
// The game's website. Development builds can point at a local server with D20_SITE_URL.
fn site_url() -> String {
    std::env::var("D20_SITE_URL")
        .ok()
        .filter(|url| {
            url.starts_with("https://")
                || url.starts_with("http://localhost:")
                || url.starts_with("http://127.0.0.1:")
        })
        .unwrap_or_else(|| "https://d20adventures.com".into())
        .trim_end_matches('/')
        .to_string()
}
// Saves, rosters and downloaded packs. Development builds can use another folder with D20_DATA_DIR, so a test run
// never touches real saves. Overriding HOME instead would also hide the login Keychain.
fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        if let Some(dir) = std::env::var_os("D20_DATA_DIR") {
            return Ok(PathBuf::from(dir));
        }
    }
    app.path().app_data_dir().map_err(|e| e.to_string())
}
// The account link's device token. Development builds keep their own item so they never touch the shipped app's link.
fn keychain() -> Result<keyring::Entry, String> {
    let service = if cfg!(debug_assertions) {
        "com.d20adventures.desktop.dev"
    } else {
        "com.d20adventures.desktop"
    };
    keyring::Entry::new(service, "account").map_err(|e| e.to_string())
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
    run_runtime(&app, &command).await
}
// Account actions only reach the website, so they skip the game lock. The token travels from the Keychain
// to the runtime over stdin and back, and the webview never sees it.
#[tauri::command]
async fn account_command(app: tauri::AppHandle, mut command: Value) -> Result<Value, String> {
    let kind = command
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !kind.starts_with("account") {
        return Err("Unknown account action.".into());
    }
    let entry = keychain()?;
    if let Some(fields) = command.as_object_mut() {
        fields.remove("token");
        if let Ok(token) = entry.get_password() {
            fields.insert("token".into(), Value::String(token));
        }
    }
    let mut response = run_runtime(&app, &command).await?;
    if let Some(fields) = response.as_object_mut() {
        if let Some(Value::String(token)) = fields.remove("storeToken") {
            entry
                .set_password(&token)
                .map_err(|e| format!("Could not save the account link: {e}"))?;
        }
        if fields.remove("clearToken") == Some(Value::Bool(true)) {
            let _ = entry.delete_credential();
        }
    }
    Ok(response)
}
// Playing needs a linked account (owner, 2026-10-08). Development builds skip that unless D20_REQUIRE_ACCOUNT is set,
// so local playtests and checks keep working without the website.
#[tauri::command]
fn account_info() -> Value {
    let required = !cfg!(debug_assertions) || std::env::var_os("D20_REQUIRE_ACCOUNT").is_some();
    let linked = keychain()
        .and_then(|entry| entry.get_password().map_err(|e| e.to_string()))
        .is_ok();
    serde_json::json!({ "required": required, "linked": linked })
}
// Opens a page of the game's website in the player's browser.
#[tauri::command]
fn open_site(path: String) -> Result<(), String> {
    if !path.starts_with('/') || path.starts_with("//") {
        return Err("Invalid page.".into());
    }
    std::process::Command::new("/usr/bin/open")
        .arg(format!("{}{}", site_url(), path))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
async fn run_runtime(app: &tauri::AppHandle, command: &Value) -> Result<Value, String> {
    let data = data_dir(app)?;
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
        .env("D20_SITE_URL", site_url())
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
        .invoke_handler(tauri::generate_handler![
            game_command,
            account_command,
            account_info,
            open_site,
            render_report
        ])
        .run(tauri::generate_context!())
        .expect("D20 Adventures failed to start");
}
