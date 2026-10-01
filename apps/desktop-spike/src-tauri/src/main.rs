use serde_json::Value;
use std::{
    path::PathBuf,
    process::Command,
    sync::atomic::{AtomicBool, Ordering},
};

static RUNNING: AtomicBool = AtomicBool::new(false);
fn spike_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf()
}

#[tauri::command]
async fn run_suite(kind: String) -> Result<Value, String> {
    if !["detect", "gm", "images"].contains(&kind.as_str()) {
        return Err("Unknown trial".into());
    }
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("Trial already running".into());
    }
    let result = tauri::async_runtime::spawn_blocking(move || {
        let spike = spike_dir();
        let root = spike.parent().unwrap().parent().unwrap();
        let output = Command::new("/usr/bin/env")
            .arg("node")
            .args(["--import", "tsx"])
            .arg(spike.join("harness/run.mjs"))
            .arg(kind)
            .current_dir(root)
            .env("D20_SPIKE_NATIVE", "true")
            .output()
            .map_err(|_| "Harness launch failed".to_string())?;
        if !output.status.success() {
            return Err("Harness exited unsuccessfully".into());
        }
        serde_json::from_slice(&output.stdout).map_err(|_| "Invalid harness result".into())
    })
    .await
    .map_err(|_| "Harness task failed".to_string());
    RUNNING.store(false, Ordering::SeqCst);
    result?
}

#[tauri::command]
fn record_webview(report: Value) -> Result<(), String> {
    // Only an allowlisted, non-secret report is persisted. Never cookies, tokens, user IDs.
    let mut clean = serde_json::Map::new();
    for key in [
        "clerkLoaded",
        "signedIn",
        "convexConnected",
        "queryResolved",
    ] {
        clean.insert(
            key.into(),
            Value::Bool(report[key].as_bool().unwrap_or(false)),
        );
    }
    for key in ["origin", "userAgent", "backendAuth", "authMethod"] {
        let value = report[key].as_str().unwrap_or("");
        if value.len() > 512 {
            return Err("Report field too long".into());
        }
        clean.insert(key.into(), Value::String(value.to_string()));
    }
    clean.insert(
        "adventureCount".into(),
        report["adventureCount"]
            .as_u64()
            .map(Value::from)
            .unwrap_or(Value::Null),
    );
    clean.insert("nativeTauri".into(), Value::Bool(true));
    let dir = spike_dir().join("results");
    std::fs::create_dir_all(&dir).map_err(|_| "Cannot create evidence directory")?;
    let name = if clean["origin"].as_str().unwrap_or("").starts_with("tauri:") {
        "webview-bundled.json"
    } else {
        "webview-dev.json"
    };
    std::fs::write(dir.join(name), serde_json::to_vec_pretty(&clean).unwrap())
        .map_err(|_| "Cannot write evidence".into())
}

#[tauri::command]
async fn test_auth() -> Result<Value, String> {
    if !cfg!(debug_assertions) {
        return Err("Test sign-in requires a debug build".into());
    }
    tauri::async_runtime::spawn_blocking(|| {
        let spike = spike_dir();
        let output = Command::new("/usr/bin/env")
            .arg("node")
            .arg(spike.join("harness/test-auth.mjs"))
            .current_dir(spike.parent().unwrap().parent().unwrap())
            .output()
            .map_err(|_| "Test helper launch failed".to_string())?;
        if !output.status.success() {
            return Err("Development test sign-in unavailable".into());
        }
        serde_json::from_slice(&output.stdout).map_err(|_| "Invalid test helper response".into())
    })
    .await
    .map_err(|_| "Test helper failed".to_string())?
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            run_suite,
            record_webview,
            test_auth
        ])
        .run(tauri::generate_context!())
        .expect("Tauri spike failed");
}
