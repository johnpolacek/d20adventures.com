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
// A runtime script kept running while the app is open: its process, its input, and its answers in turn.
type Piped = Option<(
    Child,
    tokio::process::ChildStdin,
    tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
)>;
// The narrator (runtime/narrator-main.ts).
struct Narrator(Mutex<Piped>);
// The website link for hosted games (runtime/link-main.ts).
struct HostLink(Mutex<Piped>);
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
// never touches real saves.
fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        if let Some(dir) = std::env::var_os("D20_DATA_DIR") {
            return Ok(PathBuf::from(dir));
        }
    }
    app.path().app_data_dir().map_err(|e| e.to_string())
}
// Host name from site_url(), normalized so localhost and 127.0.0.1 share one dev token slot.
fn site_slug(url: &str) -> String {
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .unwrap_or(url);
    let host = rest
        .split('/')
        .next()
        .unwrap_or_default()
        .split(':')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let host = if host == "127.0.0.1" { "localhost" } else { host.as_str() };
    let slug: String = host
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-')
        .collect();
    if slug.is_empty() {
        "default".into()
    } else {
        slug
    }
}
fn token_file_name(debug: bool, url: &str) -> String {
    let slug = site_slug(url);
    if debug {
        format!("device-token.dev.{slug}")
    } else if slug == "d20adventures.com" {
        "device-token".into()
    } else {
        format!("device-token.{slug}")
    }
}
// The account link's device token, stored in a private (0600 on Unix) file in the app data folder so ad-hoc signed
// macOS updates never lose Keychain access. Development builds keep their own file per site host so they never touch
// the shipped app's link or clobber tokens when switching between localhost and d20adventures.com.
fn token_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join(token_file_name(cfg!(debug_assertions), &site_url())))
}
fn read_token(app: &tauri::AppHandle) -> Option<String> {
    let path = token_path(app).ok()?;
    let token = std::fs::read_to_string(path).ok()?;
    let trimmed = token.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}
fn write_token(app: &tauri::AppHandle, token: &str) -> Result<(), String> {
    use std::io::Write;
    let path = token_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut tmp = path.clone().into_os_string();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut file = opts.open(&tmp).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = file.set_permissions(std::fs::Permissions::from_mode(0o600));
    }
    file.write_all(format!("{token}\n").as_bytes())
        .map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}
fn clear_token(app: &tauri::AppHandle) {
    if let Ok(path) = token_path(app) {
        let _ = std::fs::remove_file(path);
    }
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
// Account actions only reach the website, so they skip the game lock. The stored token travels from Rust
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
    if let Some(fields) = command.as_object_mut() {
        fields.remove("token");
        if let Some(token) = read_token(&app) {
            fields.insert("token".into(), Value::String(token));
        }
    }
    let mut response = run_runtime(&app, &command).await?;
    if let Some(fields) = response.as_object_mut() {
        if let Some(Value::String(token)) = fields.remove("storeToken") {
            write_token(&app, &token)
                .map_err(|e| format!("Could not save the account link: {e}"))?;
        }
        if fields.remove("clearToken") == Some(Value::Bool(true)) {
            clear_token(&app);
        }
    }
    Ok(response)
}
// Hosting reaches the website with the device token, which Rust adds here as for account actions.
#[tauri::command]
async fn host_command(
    app: tauri::AppHandle,
    link: tauri::State<'_, HostLink>,
    mut command: Value,
) -> Result<Value, String> {
    let kind = command
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !kind.starts_with("host") {
        return Err("Unknown host action.".into());
    }
    // Only reads are sent again when the link stops partway, so an action is never taken twice.
    let read = matches!(kind, "hostState" | "hostList" | "hostSheet");
    if let Some(fields) = command.as_object_mut() {
        fields.remove("token");
        if let Some(token) = read_token(&app) {
            fields.insert("token".into(), Value::String(token));
        }
    }
    let mut slot = link.0.lock().await;
    ask_piped(&app, &mut slot, "link.cjs", &command, read)
        .await
        .map_err(|e| {
            if e.starts_with("Could not start") {
                e
            } else {
                "The website link stopped. Try again.".into()
            }
        })
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
    let token = read_token(&app)
        .ok_or("Link this computer to your D20 Adventures account to host a game.")?;
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
fn account_info(app: tauri::AppHandle) -> Value {
    let required = !cfg!(debug_assertions) || std::env::var_os("D20_REQUIRE_ACCOUNT").is_some();
    let linked = read_token(&app).is_some();
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
    if cfg!(debug_assertions) {
        command.env("D20_DEV_BUILD", "1");
    }
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
    ask_piped(&app, &mut slot, "narrator/run/narrator.cjs", &command, true)
        .await
        .map_err(|_| "The narrator stopped.".into())
}
// One request to a kept runtime script, which starts on the first and again if it stopped. A request sent before the
// script stopped is sent once more only when `retry` is set.
async fn ask_piped(
    app: &tauri::AppHandle,
    slot: &mut Piped,
    script: &str,
    command: &Value,
    retry: bool,
) -> Result<Value, String> {
    for attempt in 0..2 {
        if slot.is_none() {
            let data = data_dir(app)?;
            std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
            let mut child = runtime_command(app, script, &data)?
                .stdout(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Could not start {script}: {e}"))?;
            let stdin = child.stdin.take().ok_or("Missing input pipe")?;
            let stdout = child.stdout.take().ok_or("Missing output pipe")?;
            *slot = Some((child, stdin, BufReader::new(stdout).lines()));
        }
        let (_, stdin, lines) = slot.as_mut().unwrap();
        let sent = stdin.write_all(format!("{}\n", command).as_bytes()).await;
        if sent.is_ok() {
            if let Ok(Some(line)) = lines.next_line().await {
                return serde_json::from_str(&line)
                    .map_err(|_| format!("{script} returned an unreadable response."));
            }
        }
        // The process stopped: it starts again once. A request it may have taken before stopping is sent again only
        // when `retry` allows it.
        if let Some((mut child, _, _)) = slot.take() {
            let _ = child.kill().await;
        }
        if attempt == 1 || (sent.is_ok() && !retry) {
            break;
        }
    }
    Err(format!("{script} stopped."))
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
// D20_AUTOPILOT_DIR as <name>.json, with each turn a live autopilot asks for. Shipped builds write nothing.
#[tauri::command]
fn autopilot_mark(name: String, data: Value) -> Result<(), String> {
    if !cfg!(debug_assertions) || !(name == "ready" || name == "done" || name == "turn") {
        return Ok(());
    }
    if let Some(dir) = std::env::var_os("D20_AUTOPILOT_DIR") {
        let dir = PathBuf::from(dir);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::write(dir.join(format!("{name}.json")), data.to_string()).map_err(|e| e.to_string())?;
    }
    Ok(())
}
// A live autopilot's reply, written to D20_AUTOPILOT_DIR as reply.json by whoever plays the heroes, taken once read.
#[tauri::command]
fn autopilot_reply() -> Option<Value> {
    if !cfg!(debug_assertions) {
        return None;
    }
    let file = PathBuf::from(std::env::var_os("D20_AUTOPILOT_DIR")?).join("reply.json");
    let text = std::fs::read_to_string(&file).ok()?;
    let value = serde_json::from_str(&text).ok()?;
    let _ = std::fs::remove_file(&file);
    Some(value)
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
        .manage(HostLink(Mutex::new(None)))
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
            autopilot_mark,
            autopilot_reply
        ])
        .run(tauri::generate_context!())
        .expect("D20 Adventures failed to start");
}

#[cfg(test)]
mod tests {
    use super::{site_slug, token_file_name};

    #[test]
    fn site_slug_normalizes_local_and_remote_hosts() {
        assert_eq!(site_slug("https://d20adventures.com"), "d20adventures.com");
        assert_eq!(site_slug("http://localhost:3000"), "localhost");
        assert_eq!(site_slug("http://127.0.0.1:3058/"), "localhost");
    }

    #[test]
    fn token_files_stay_separate_for_release_and_dev_sites() {
        assert_eq!(token_file_name(false, "https://d20adventures.com"), "device-token");
        assert_eq!(
            token_file_name(true, "https://d20adventures.com"),
            "device-token.dev.d20adventures.com"
        );
        assert_eq!(
            token_file_name(true, "http://localhost:3000"),
            "device-token.dev.localhost"
        );
        assert_eq!(
            token_file_name(true, "http://127.0.0.1:3058"),
            "device-token.dev.localhost"
        );
    }
}
