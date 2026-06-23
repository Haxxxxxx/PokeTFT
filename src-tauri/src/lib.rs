use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

const HOSTED: &str = "https://poketft-arena.web.app";

// A small page shown in the browser tab after the credential is handed off — the
// app focuses itself, so this is just a courtesy.
const DONE_HTML: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>PokéTFT</title>
<style>html,body{height:100%;margin:0;background:#020617;color:#fbbf24;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center}</style>
</head><body><div style="text-align:center"><div style="font-size:28px">✅</div><div style="font-weight:800;margin-top:8px">Signed in — back to PokéTFT.</div><div style="color:#94a3b8;font-size:13px;margin-top:6px">You can close this tab.</div></div></body></html>"#;

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

      // Build the main window in Rust so we can:
      //  (a) flag the shell to the (remotely-loaded) page via an init script, and
      //  (b) intercept the sentinel the page navigates to when the user clicks
      //      "Sign in with Google" (Google blocks OAuth inside embedded webviews).
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
          // Seamless Google sign-in:
          //  1. start a localhost loopback server,
          //  2. open the system browser to the bridge page (passing the port),
          //  3. the browser hands the credential back to localhost → we sign the
          //     app in and bring it to front. No deep link / custom-scheme prompt.
          let cb_handle = app_handle.clone();
          let started = tauri_plugin_oauth::start_with_config(
            tauri_plugin_oauth::OauthConfig { ports: None, response: Some(DONE_HTML.into()) },
            move |redirect_url| {
              if let Some(win) = cb_handle.get_webview_window("main") {
                let arg = serde_json::to_string(&redirect_url).unwrap_or_else(|_| "\"\"".to_string());
                let _ = win.eval(&format!("window.__poketftNativeAuth && window.__poketftNativeAuth({arg})"));
                let _ = win.set_focus();
              }
            },
          );
          if let Ok(port) = started {
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
