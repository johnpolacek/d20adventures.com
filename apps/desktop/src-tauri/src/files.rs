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
        out.push(repo);
    }
    if let Some(data) = data {
        out.push(data.join("files"));
    }
    out
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
    if allowed {
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
