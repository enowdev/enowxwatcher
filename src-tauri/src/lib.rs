// enowxwatcher — cross-platform VPS monitor that lives in the tray.
mod commands;
mod metrics;
mod poller;
mod ssh;
mod store;
mod webhook;

use std::sync::Arc;

use commands::AppState;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_positioner::{Position, WindowExt};

/// Parse `enowxwatcher://add?host=..&user=..&port=..&name=..` and forward to the
/// frontend, opening the main window so the Add dialog can pre-fill.
fn handle_deep_link(app: &tauri::AppHandle, url: &str) {
    let Some(qs) = url.split('?').nth(1) else {
        return;
    };
    let mut fields = serde_json::Map::new();
    for pair in qs.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            let val = urlencoding_decode(v);
            fields.insert(k.to_string(), serde_json::Value::String(val));
        }
    }
    show_main_window(app);
    let _ = app.emit("enroll-vps", serde_json::Value::Object(fields));
}

/// Minimal percent-decoding (installer only encodes a handful of chars).
fn urlencoding_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(if bytes[i] == b'+' { b' ' } else { bytes[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

// Toggle the tray popover window: show near the tray icon, or hide it.
fn toggle_tray_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("tray") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.move_window(Position::TrayCenter);
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // Shared state: config store + runtime metrics, and the poller.
            let store = Arc::new(store::Store::load().expect("load config"));
            let runtime: poller::SharedRuntime = Default::default();
            app.manage(AppState {
                store: store.clone(),
                runtime: runtime.clone(),
            });
            poller::spawn(app.handle().clone(), store, runtime);

            // Register the enowxwatcher:// scheme at runtime (dev + Linux) and
            // handle any link that launched or is sent to the app.
            let _ = app.deep_link().register("enowxwatcher");
            {
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        handle_deep_link(&handle, url.as_str());
                    }
                });
            }

            // Tray menu (right-click): Open / Quit.
            let open_i = MenuItem::with_id(app, "open", "Open enowxwatcher", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &quit_i])?;

            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("enowxwatcher")
                .menu(&menu)
                .show_menu_on_left_click(false) // left click = popover, not menu
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_tray_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing a window hides it (stay alive in the tray) instead of quitting.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
            // Hide the tray popover when it loses focus.
            if let WindowEvent::Focused(false) = event {
                if window.label() == "tray" {
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_vps,
            commands::get_statuses,
            commands::test_connection,
            commands::add_vps,
            commands::remove_vps,
            commands::get_public_key,
            commands::list_webhooks,
            commands::set_webhooks,
            commands::test_webhook,
            commands::get_settings,
            commands::set_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running enowxwatcher");
}
