// The stage's files for the window, at d20://localhost/<path> (http://d20.localhost/<path> on Windows): an adventure's
// art and figures as runtime/files.ts downloaded them into the data folder, else the app's own bundled files (the
// stage's kit, the covers, premade heroes and the title screen's scene). Development reads the repo's own first, so
// new art shows before it is synced.
use std::path::{Component, Path, PathBuf};
use tauri::http::{Request, Response};
use tauri::{Runtime, UriSchemeContext, UriSchemeResponder};

pub const SCHEME: &str = "d20";

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

fn roots(data: Option<PathBuf>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if cfg!(debug_assertions) {
        let repo = manifest.join("../../..");
        out.push(repo.join("public"));
        out.push(repo);
    }
    if let Some(data) = data {
        out.push(data.join("files"));
    }
    out
}

pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    data: Option<PathBuf>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    let path = decode(request.uri().path());
    std::thread::spawn(move || {
        let rel = PathBuf::from(path.trim_start_matches('/'));
        // Only the stage's own folders, and nothing that climbs out of them.
        let allowed = (rel.starts_with("stage") || rel.starts_with("asset-library") || rel.starts_with("images"))
            && rel.components().all(|c| matches!(c, Component::Normal(_)));
        let found = if allowed {
            roots(data).into_iter().map(|root| root.join(&rel)).find(|file| file.is_file())
        } else {
            None
        };
        let read = found.and_then(|file| std::fs::read(&file).ok().map(|body| (content_type(&file).to_string(), body)));
        // Else the app's own copy, bundled with the window.
        let read = read.or_else(|| {
            if !allowed {
                return None;
            }
            app.asset_resolver().get(format!("/{}", path.trim_start_matches('/'))).map(|a| (a.mime_type().to_string(), a.bytes().to_vec()))
        });
        let response = match read {
            Some((kind, body)) => Response::builder()
                .status(200)
                .header("Content-Type", kind)
                .header("Access-Control-Allow-Origin", "*")
                .body(body),
            None => Response::builder()
                .status(404)
                .header("Access-Control-Allow-Origin", "*")
                .body(Vec::new()),
        };
        responder.respond(response.unwrap_or_else(|_| Response::new(Vec::new())));
    });
}
