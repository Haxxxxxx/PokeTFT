use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
#[cfg(any(windows, target_os = "linux"))]
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

const HOSTED: &str = "https://game-poketft-arena.web.app";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Must be registered FIRST: on Windows/Linux a deep-link click launches a new
    // process (unlike macOS/Android, which route the URL to the running app via an
    // OS event) — this plugin re-forwards that second launch's URL into the ALREADY
    // running instance (as the same `onOpenUrl` event the JS side listens for) and
    // exits the new process, instead of leaving the user signed in on a duplicate,
    // orphaned window while the original stays signed out.
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      // The deep-link plugin only re-emits the URL event on this forward — it
      // doesn't touch window focus, and unlike macOS (which auto-activates the
      // app on a scheme handoff), nothing else brings the window to the front
      // here either, so the user could sign in successfully and never notice.
      if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.set_focus();
      }
    }))
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_deep_link::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
        // `tauri dev` runs an unbundled binary the OS never registered as the
        // `poketft://` handler — register it for this session so the deep-link
        // round trip is testable without a full install. Windows/Linux only:
        // register() is a real OS-registry/xdg-mime write there, but on macOS
        // (and Android/iOS) it unconditionally returns UnsupportedPlatform — the
        // scheme comes from the app bundle's Info.plist/manifest there instead,
        // which only exists in a packaged build, so a macOS/mobile dev binary
        // can't register at runtime at all. Calling it unguarded crashes the
        // whole app: tauri's macOS app-delegate setup path can't unwind a
        // setup-hook Err cleanly, so the propagated error aborts the process
        // instead of just failing gracefully.
        #[cfg(any(windows, target_os = "linux"))]
        app.deep_link().register_all()?;
      }

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
          // Seamless Google sign-in: Google refuses to run its OAuth flow inside an
          // embedded webview, so hand off to the user's real default browser (where
          // they're likely already signed into Google) instead of navigating here.
          // The bridge page it opens signs in with Firebase, then redirects to the
          // poketft://auth-callback deep link, which the OS (or, on Windows/Linux,
          // the single-instance forward above) routes back into THIS window as an
          // `onOpenUrl` event — see authStore.ts's native-shell branch.
          let _ = app_handle.opener().open_url(format!("{HOSTED}/native-auth"), None::<&str>);
          false // cancel the in-webview navigation; the browser takes over
        })
        .build()?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
