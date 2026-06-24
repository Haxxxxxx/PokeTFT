use std::sync::{Arc, Mutex};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

const HOSTED: &str = "https://game-poketft-arena.web.app";

// Branded page shown in the browser tab once the credential is handed off — a
// spinning-less Pokéball + wordmark matching the in-app bridge. Auto-closes.
const DONE_HTML: &str = r#"<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PokéTFT</title>
<style>
  html,body{height:100%;margin:0;background:#0a0e1a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center}
  .card{display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;padding:40px 34px;border-radius:20px;background:rgba(15,23,42,.55);border:1px solid rgba(251,191,36,.14);box-shadow:0 30px 80px -30px rgba(0,0,0,.8)}
  .ball{position:relative;width:54px;height:54px}
  .ball .b{position:absolute;inset:0;border-radius:50%;background:linear-gradient(#ef4444 0 50%,#f8fafc 50% 100%);border:3px solid #0a0e1a}
  .ball .band{position:absolute;top:calc(50% - 2px);left:0;right:0;height:4px;background:#0a0e1a}
  .ball .c{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:18px;height:18px;border-radius:50%;background:#f8fafc;border:3px solid #0a0e1a}
  .title{font-size:20px;font-weight:800}
  .gild{background:linear-gradient(180deg,#fde68a,#d4af37);-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{font-size:13px;color:#94a3b8;line-height:1.5}
</style></head>
<body><div class="card">
  <div class="ball"><span class="b"></span><span class="band"></span><span class="c"></span></div>
  <div class="title">Signed in to Poké<span class="gild">TFT</span></div>
  <div class="sub">You're all set — switch back to the app.<br>This tab will close automatically.</div>
</div>
<script>setTimeout(function(){window.close()},1400)</script>
</body></html>"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_oauth::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Build the main window in Rust so we can (a) flag the shell to the
      // remotely-loaded page via an init script, and (b) intercept the sentinel
      // the page navigates to when the user clicks Google (which Google blocks
      // inside an embedded webview).
      let app_handle = app.handle().clone();
      WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("PokéTFT")
        .inner_size(1280.0, 800.0)
        .min_inner_size(800.0, 540.0)
        .resizable(true)
        .initialization_script("window.__POKETFT_SHELL__ = true;")
        .on_navigation(move |url| {
          if !url.as_str().contains("/__native-google") {
            return true;
          }
          // Seamless Google sign-in: start a localhost loopback, open the system
          // browser to the bridge, and on the credential callback sign the app in,
          // focus it, and SHUT THE SERVER DOWN (no lingering localhost listener).
          let cb_handle = app_handle.clone();
          let port_cell: Arc<Mutex<Option<u16>>> = Arc::new(Mutex::new(None));
          let port_cb = port_cell.clone();
          let started = tauri_plugin_oauth::start_with_config(
            tauri_plugin_oauth::OauthConfig { ports: None, response: Some(DONE_HTML.into()) },
            move |redirect_url| {
              if let Some(win) = cb_handle.get_webview_window("main") {
                let arg = serde_json::to_string(&redirect_url).unwrap_or_else(|_| "\"\"".to_string());
                let _ = win.eval(&format!("window.__poketftNativeAuth && window.__poketftNativeAuth({arg})"));
                let _ = win.set_focus();
              }
              if let Some(p) = *port_cb.lock().unwrap() {
                let _ = tauri_plugin_oauth::cancel(p);
              }
            },
          );
          if let Ok(port) = started {
            *port_cell.lock().unwrap() = Some(port);
            let _ = app_handle
              .opener()
              .open_url(format!("{HOSTED}/native-auth?cb={port}"), None::<&str>);
          }
          false // cancel the in-webview navigation; the browser takes over
        })
        .build()?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
