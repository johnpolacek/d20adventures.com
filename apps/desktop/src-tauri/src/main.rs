#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde_json::Value;
use std::sync::Arc;
use std::{path::PathBuf, process::Stdio};
use tauri::Manager;
mod files;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, Command},
    sync::Mutex,
};
struct GameLock(Mutex<()>);
// The host worker while this app hosts a website game: the adventure, its process, and its latest event.
struct HostWorker(Mutex<Option<(String, Child)>>, Arc<std::sync::Mutex<Value>>);
// The narrator while the app is open (runtime/narrator-main.ts): its process, its input, and its answers in turn.
struct Narrator(
    Mutex<
        Option<(
            Child,
            tokio::process::ChildStdin,
            tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
        )>,
    >,
);
// The user's home folder. Windows names it USERPROFILE.
fn home() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default()
}
fn node() -> Result<PathBuf, String> {
    let home = home();
    let exe = if cfg!(windows) { "node.exe" } else { "node" };
    let mut candidates: Vec<PathBuf> = [
        ".local/share/fnm/aliases/default/bin",
        ".volta/bin",
        ".local/bin",
    ]
    .iter()
    .map(|p| PathBuf::from(&home).join(p).join(exe))
    .collect();
    if cfg!(windows) {
        if let Some(dir) = std::env::var_os("ProgramFiles") {
            candidates.push(PathBuf::from(dir).join("nodejs").join(exe));
        }
    } else {
        candidates.extend([
            PathBuf::from("/opt/homebrew/bin/node"),
            PathBuf::from("/usr/local/bin/node"),
            PathBuf::from("/usr/bin/node"),
        ]);
    }
    if let Some(path) = std::env::var_os("PATH") {
        candidates.extend(
            std::env::split_paths(&path)
                .filter(|p| p.is_absolute())
                .map(|p| p.join(exe)),
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
// Suggested replies only read the save, so they skip the game lock and never hold up a game action.
#[tauri::command]
async fn suggest_command(app: tauri::AppHandle, command: Value) -> Result<Value, String> {
    let kind = command
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if kind != "suggest" {
        return Err("Unknown suggestion request.".into());
    }
    run_runtime(&app, &command).await
}
// Where the window fetches the stage's files (files.rs).
struct FilesHost(String);
#[tauri::command]
fn files_host(host: tauri::State<'_, FilesHost>) -> String {
    host.0.clone()
}
// An adventure's art and figures: planning and downloading never touch the save, so they skip the game lock and run
// behind play (runtime/files.ts).
#[tauri::command]
async fn files_command(app: tauri::AppHandle, command: Value) -> Result<Value, String> {
    let kind = command
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if kind != "filesPlan" && kind != "filesFetch" {
        return Err("Unknown files request.".into());
    }
    run_runtime(&app, &command).await
}
// The model a CLI runs comes from the CLI alone, so asking skips the game lock too.
#[tauri::command]
async fn model_command(app: tauri::AppHandle, provider: String) -> Result<Value, String> {
    run_runtime(
        &app,
        &serde_json::json!({ "kind": "model", "provider": provider }),
    )
    .await
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
// Hosting reaches the website with the device token, which Rust adds here as for account actions.
#[tauri::command]
async fn host_command(app: tauri::AppHandle, mut command: Value) -> Result<Value, String> {
    let kind = command
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !kind.starts_with("host") {
        return Err("Unknown host action.".into());
    }
    if let Some(fields) = command.as_object_mut() {
        fields.remove("token");
        if let Ok(token) = keychain()?.get_password() {
            fields.insert("token".into(), Value::String(token));
        }
    }
    run_runtime(&app, &command).await
}
// Starts the host worker for one hosted game, replacing any other.
#[tauri::command]
async fn host_start(
    app: tauri::AppHandle,
    worker: tauri::State<'_, HostWorker>,
    adventure_id: String,
    provider: String,
    model: Option<String>,
) -> Result<(), String> {
    let token = keychain()?
        .get_password()
        .map_err(|_| "Link this computer to your D20 Adventures account to host a game.")?;
    let mut slot = worker.0.lock().await;
    if let Some((_, mut old)) = slot.take() {
        let _ = old.kill().await;
    }
    let data = data_dir(&app)?;
    std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
    let mut child = runtime_command(&app, "host.cjs", &data)?
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start hosting: {e}"))?;
    let start = serde_json::json!({
        "adventureId": adventure_id,
        "provider": provider,
        "model": model,
        "token": token,
        "site": site_url(),
        "data": data.to_string_lossy(),
    });
    let mut stdin = child.stdin.take().ok_or("Missing host input pipe")?;
    stdin
        .write_all(format!("{}\n", start).as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    // Kept open with the process: the worker also stops when its input closes.
    child.stdin = Some(stdin);
    let stdout = child.stdout.take().ok_or("Missing host output pipe")?;
    let last = worker.1.clone();
    *last.lock().unwrap() = serde_json::json!({ "type": "starting" });
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Ok(event) = serde_json::from_str::<Value>(&line) {
                *last.lock().unwrap() = event;
            }
        }
        *last.lock().unwrap() = serde_json::json!({ "type": "stopped" });
    });
    *slot = Some((adventure_id, child));
    Ok(())
}
#[tauri::command]
async fn host_stop(worker: tauri::State<'_, HostWorker>) -> Result<(), String> {
    if let Some((_, mut child)) = worker.0.lock().await.take() {
        let _ = child.kill().await;
    }
    Ok(())
}
// Which hosted game, if any, this app is running the GM for, and what its worker last reported.
#[tauri::command]
async fn host_running(worker: tauri::State<'_, HostWorker>) -> Result<Value, String> {
    let id = worker.0.lock().await.as_ref().map(|(id, _)| id.clone());
    let event = worker.1.lock().unwrap().clone();
    Ok(serde_json::json!({ "adventureId": id, "event": event }))
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
// Fills the screen, or returns to a window. Answers whether the window is now fullscreen.
#[tauri::command]
fn toggle_fullscreen(window: tauri::WebviewWindow) -> Result<bool, String> {
    let full = !window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(full).map_err(|e| e.to_string())?;
    Ok(full)
}
#[tauri::command]
fn is_fullscreen(window: tauri::WebviewWindow) -> Result<bool, String> {
    window.is_fullscreen().map_err(|e| e.to_string())
}
// Opens a page of the game's website in the player's browser.
#[tauri::command]
fn open_site(path: String) -> Result<(), String> {
    if !path.starts_with('/') || path.starts_with("//") {
        return Err("Invalid page.".into());
    }
    let url = format!("{}{}", site_url(), path);
    #[cfg(target_os = "macos")]
    let mut open = std::process::Command::new("/usr/bin/open");
    #[cfg(target_os = "linux")]
    let mut open = std::process::Command::new("xdg-open");
    #[cfg(windows)]
    let mut open = {
        let mut command = std::process::Command::new("rundll32");
        command.arg("url.dll,FileProtocolHandler");
        command
    };
    open.arg(url).spawn().map_err(|e| e.to_string())?;
    Ok(())
}
// What the runtime and the CLIs it starts need from the environment. None of it holds credentials.
const ENV: &[&str] = &["HOME", "PATH", "USER", "LOGNAME", "LANG", "TMPDIR"];
#[cfg(windows)]
const PLATFORM_ENV: &[&str] = &[
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "SystemRoot",
    "SystemDrive",
    "PATHEXT",
    "TEMP",
    "TMP",
    "HOMEDRIVE",
    "HOMEPATH",
    "ComSpec",
    "ProgramData",
    "ProgramFiles",
];
#[cfg(target_os = "linux")]
const PLATFORM_ENV: &[&str] = &[
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
    "XDG_RUNTIME_DIR",
    "DBUS_SESSION_BUS_ADDRESS",
];
#[cfg(target_os = "macos")]
const PLATFORM_ENV: &[&str] = &[];
// A Node process for one of the bundled runtime scripts, with a minimal environment.
fn runtime_command(
    app: &tauri::AppHandle,
    script: &str,
    data: &PathBuf,
) -> Result<Command, String> {
    let resources = if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources")
    } else {
        app.path().resource_dir().map_err(|e| e.to_string())?
    };
    let mut command = Command::new(node()?);
    command
        .arg(resources.join(script))
        .arg(data.join("adventure.sqlite"))
        .current_dir(data)
        .env_clear()
        .envs(
            ENV.iter()
                .chain(PLATFORM_ENV)
                .filter_map(|key| std::env::var(key).ok().map(|value| (*key, value))),
        )
        .env("D20_SITE_URL", site_url())
        .stdin(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    // No console window flashes up for it on Windows.
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);
    Ok(command)
}
// One request to the narrator: loading its model, or speaking a sentence. It starts on the first, and again if it stopped.
#[tauri::command]
async fn narrator_command(
    app: tauri::AppHandle,
    narrator: tauri::State<'_, Narrator>,
    command: Value,
) -> Result<Value, String> {
    let mut slot = narrator.0.lock().await;
    for attempt in 0..2 {
        if slot.is_none() {
            let data = data_dir(&app)?;
            std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
            let mut child = runtime_command(&app, "narrator/run/narrator.cjs", &data)?
                .stdout(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Could not start the narrator: {e}"))?;
            let stdin = child.stdin.take().ok_or("Missing narrator input pipe")?;
            let stdout = child.stdout.take().ok_or("Missing narrator output pipe")?;
            *slot = Some((child, stdin, BufReader::new(stdout).lines()));
        }
        let (_, stdin, lines) = slot.as_mut().unwrap();
        let sent = stdin.write_all(format!("{}\n", command).as_bytes()).await;
        if sent.is_ok() {
            if let Ok(Some(line)) = lines.next_line().await {
                return serde_json::from_str(&line)
                    .map_err(|_| "The narrator returned an unreadable response.".into());
            }
        }
        // The process stopped: it starts again once.
        if let Some((mut child, _, _)) = slot.take() {
            let _ = child.kill().await;
        }
        if attempt == 1 {
            break;
        }
    }
    Err("The narrator stopped.".into())
}
async fn run_runtime(app: &tauri::AppHandle, command: &Value) -> Result<Value, String> {
    let data = data_dir(app)?;
    std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
    let mut child = runtime_command(app, "runtime.cjs", &data)?
        .stdout(Stdio::piped())
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
// The development autopilot's progress, for the recorder (apps/desktop/scripts/record-playthrough.ts), written to
// D20_AUTOPILOT_DIR as <name>.json. Shipped builds write nothing.
#[tauri::command]
fn autopilot_mark(name: String, data: Value) -> Result<(), String> {
    if !cfg!(debug_assertions) || !(name == "ready" || name == "done") {
        return Ok(());
    }
    if let Some(dir) = std::env::var_os("D20_AUTOPILOT_DIR") {
        let dir = PathBuf::from(dir);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::write(dir.join(format!("{name}.json")), data.to_string()).map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn main() {
    tauri::Builder::default()
        // The stage's files, served on 127.0.0.1: downloaded adventures, then the app's own (files.rs).
        .setup(|app| {
            let handle = app.handle().clone();
            let data = data_dir(&handle).ok();
            app.manage(FilesHost(files::serve(handle, data)?));
            Ok(())
        })
        .manage(GameLock(Mutex::new(())))
        .manage(Narrator(Mutex::new(None)))
        .manage(HostWorker(
            Mutex::new(None),
            Arc::new(std::sync::Mutex::new(Value::Null)),
        ))
        .invoke_handler(tauri::generate_handler![
            game_command,
            suggest_command,
            files_command,
            files_host,
            model_command,
            account_command,
            host_command,
            host_start,
            host_stop,
            host_running,
            narrator_command,
            account_info,
            open_site,
            toggle_fullscreen,
            is_fullscreen,
            render_report,
            autopilot_mark
        ])
        .run(tauri::generate_context!())
        .expect("D20 Adventures failed to start");
}
