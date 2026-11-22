// The stage's files for the window, from a small HTTP server on 127.0.0.1: an adventure's art and figures as
// runtime/files.ts downloaded them into the data folder, else the app's own copy bundled with the window (the stage's
// kit, the covers, premade heroes and the title screen's scene). Development reads the repo's own first.
//
// Plain HTTP, and not a custom scheme, because WebKit gives a custom scheme's images no CORS answer: WebGL then
// refuses them ("The operation is insecure"). From 127.0.0.1 they pass the same check the website's images pass from
// the asset host.
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Runtime};

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or_default() {
        "webp" => "image/webp",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "json" => "application/json",
        "glb" => "model/gltf-binary",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "ktx2" => "image/ktx2",
        "hdr" => "image/vnd.radiance",
        _ => "application/octet-stream",
    }
}

fn decode(path: &str) -> String {
    let bytes = path.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&path[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn roots(data: &Option<PathBuf>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if cfg!(debug_assertions) {
        let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
        out.push(repo.join("public"));
        out.push(repo.clone());
        // What the build bundles with the window (scripts/build-runtime.ts), which the dev window does not embed.
        out.push(repo.join("apps/desktop/public"));
    }
    if let Some(data) = data {
        // A creator's packages carry their own files (runtime/creator.ts), ahead of the downloads.
        if let Ok(dirs) = std::fs::read_dir(data.join("creator")) {
            let mut dirs: Vec<PathBuf> = dirs.flatten().map(|d| d.path().join("files")).filter(|p| p.is_dir()).collect();
            dirs.sort();
            out.extend(dirs);
        }
        out.push(data.join("files"));
    }
    out
}

// The creator packages in the data folder, as JSON: their ids, which the window loads (src/stage-data.ts).
fn creator_index(data: &Option<PathBuf>) -> Vec<u8> {
    let mut ids: Vec<String> = data
        .as_ref()
        .and_then(|d| std::fs::read_dir(d.join("creator")).ok())
        .map(|dirs| {
            dirs.flatten()
                .filter(|d| d.path().join("package.json").is_file())
                .filter_map(|d| d.file_name().into_string().ok())
                .filter(|id| id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'))
                .collect()
        })
        .unwrap_or_default();
    ids.sort();
    serde_json::to_vec(&ids).unwrap_or_default()
}

fn respond<R: Runtime>(app: &AppHandle<R>, data: &Option<PathBuf>, stream: TcpStream) -> std::io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut line = String::new();
    reader.read_line(&mut line)?;
    // The rest of the request's head is read and ignored.
    let mut header = String::new();
    while reader.read_line(&mut header)? > 2 {
        header.clear();
    }
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let path = decode(parts.next().unwrap_or_default().split('?').next().unwrap_or_default());
    let rel = PathBuf::from(path.trim_start_matches('/'));
    // Only the stage's own folders, and nothing that climbs out of them.
    let allowed = (method == "GET" || method == "HEAD")
        && (rel.starts_with("stage") || rel.starts_with("asset-library") || rel.starts_with("images"))
        && rel.components().all(|c| matches!(c, Component::Normal(_)));
    let mut found: Option<(String, Vec<u8>)> = None;
    let get = method == "GET" || method == "HEAD";
    let safe = rel.components().all(|c| matches!(c, Component::Normal(_)));
    // A creator's packages: their list, and each one's stage (creator/<id>/stage/...json).
    if get && safe && rel == Path::new("creator/index.json") {
        found = Some(("application/json".into(), creator_index(data)));
    } else if get && safe && rel.starts_with("creator") && rel.components().nth(2).map(|c| c.as_os_str() == "stage").unwrap_or(false) {
        found = data
            .as_ref()
            .map(|d| d.join(&rel))
            .filter(|f| f.is_file())
            .and_then(|f| std::fs::read(&f).ok().map(|body| (content_type(&f).to_string(), body)));
    } else if allowed {
        found = roots(data)
            .into_iter()
            .map(|root| root.join(&rel))
            .find(|file| file.is_file())
            .and_then(|file| std::fs::read(&file).ok().map(|body| (content_type(&file).to_string(), body)));
        // Else the app's own copy, bundled with the window. The resolver answers a path it lacks with the window's
        // page, which is no stage file.
        if found.is_none() {
            found = app
                .asset_resolver()
                .get(format!("/{}", rel.to_string_lossy()))
                .filter(|a| !a.mime_type().starts_with("text/html"))
                .map(|a| (a.mime_type().to_string(), a.bytes().to_vec()));
        }
    }
    let mut stream = stream;
    match found {
        Some((kind, body)) => {
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n",
                body.len()
            )?;
            if method == "GET" {
                stream.write_all(&body)?;
            }
        }
        None => write!(stream, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n")?,
    }
    stream.flush()
}

/// Starts the server on a free port and returns its address, such as http://127.0.0.1:52144.
pub fn serve<R: Runtime>(app: AppHandle<R>, data: Option<PathBuf>) -> Result<String, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let app = app.clone();
            let data = data.clone();
            std::thread::spawn(move || {
                let _ = respond(&app, &data, stream);
            });
        }
    });
    Ok(format!("http://127.0.0.1:{port}"))
}
