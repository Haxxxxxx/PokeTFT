use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

const HOSTED: &str = "https://poketft-arena.web.app";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_deep_link::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Desktop dev only: register the poketft:// scheme to this executable so the
      // deep-link bridge works without installing. (macOS resolves it for the
      // bundled .app in /Applications; Android registers via the manifest.)
      #[cfg(any(windows, target_os = "linux"))]
      {
        let _ = app.deep_link().register_all();
      }

      // Google sign-in bridge — RETURN trip. The system browser finishes OAuth and
      // redirects to poketft://auth#id_token=...&access_token=... . Hand the URL to
      // the web page, which completes via signInWithCredential().
      let return_handle = app.handle().clone();
      app.deep_link().on_open_url(move |event| {
        if let Some(url) = event.urls().into_iter().next() {
          if let Some(win) = return_handle.get_webview_window("main") {
            let arg = serde_json::to_string(&url.to_string()).unwrap_or_else(|_| "\"\"".to_string());
            let js = format!("window.__poketftNativeAuth && window.__poketftNativeAuth({arg})");
            let _ = win.eval(&js);
            let _ = win.set_focus();
          }
        }
      });

      // Build the main window in Rust so we can:
      //  (a) flag the shell to the (remotely-loaded) web page via an init script —
      //      reliable where the __TAURI__ IPC global is not injected, and
      //  (b) intercept the sentinel navigation the page uses to request a
      //      system-browser open (Google blocks OAuth inside embedded webviews).
      let open_handle = app.handle().clone();
      WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("PokéTFT")
        .inner_size(1280.0, 800.0)
        .min_inner_size(800.0, 540.0)
        .resizable(true)
        .initialization_script("window.__POKETFT_SHELL__ = true;")
        .on_navigation(move |url| {
          // OUT trip: the web app navigates here to ask for a real-browser sign-in.
          if url.as_str().contains("/__native-google") {
            let _ = open_handle
              .opener()
              .open_url(format!("{HOSTED}/native-auth"), None::<&str>);
            return false; // cancel the in-webview navigation; the browser takes over
          }
          true
        })
        .build()?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
