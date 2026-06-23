use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

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
      // deep-link bridge works without installing. (macOS requires the bundled .app
      // to live in /Applications; Android registers via the manifest intent filter.)
      #[cfg(any(windows, target_os = "linux"))]
      {
        let _ = app.deep_link().register_all();
      }

      // Google sign-in bridge (return trip): the system browser finishes OAuth and
      // redirects to poketft://auth#id_token=...&access_token=... . Hand that whole
      // URL to the web page, which completes via signInWithCredential().
      let handle = app.handle().clone();
      app.deep_link().on_open_url(move |event| {
        if let Some(url) = event.urls().into_iter().next() {
          if let Some(win) = handle.get_webview_window("main") {
            // serde_json gives us a safely-escaped JS string literal.
            let arg = serde_json::to_string(&url.to_string()).unwrap_or_else(|_| "\"\"".to_string());
            let js = format!("window.__poketftNativeAuth && window.__poketftNativeAuth({arg})");
            let _ = win.eval(&js);
            let _ = win.set_focus();
          }
        }
      });

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
