//! Tauri commands invoked from the frontend.

use std::sync::Arc;

use serde::Deserialize;
use tauri::State;

use crate::poller::{SharedRuntime, VpsStatus};
use crate::ssh::{self, Auth};
use crate::store::{AuthKind, Store, Vps, WebhookRule};

pub struct AppState {
    pub store: Arc<Store>,
    pub runtime: SharedRuntime,
}

#[derive(Deserialize)]
pub struct NewVps {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub auth: AuthKind,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[tauri::command]
pub fn list_vps(state: State<AppState>) -> Vec<Vps> {
    state.store.vpses()
}

#[tauri::command]
pub async fn get_statuses(state: State<'_, AppState>) -> Result<Vec<VpsStatus>, String> {
    let rt = state.runtime.lock().await;
    Ok(rt.statuses.values().cloned().collect())
}

/// Try connecting + fetching one sample. Used by the Add form and by enrollment.
#[tauri::command]
pub async fn test_connection(vps: NewVps) -> Result<crate::metrics::VpsMetrics, String> {
    let auth = match vps.auth {
        AuthKind::Key => Auth::Key(crate::store::get_or_create_private_key().map_err(|e| e.to_string())?),
        AuthKind::Password => Auth::Password(vps.password.clone().unwrap_or_default()),
    };
    let out = ssh::run_command(
        &vps.host,
        vps.port,
        &vps.user,
        &auth,
        crate::metrics::METRIC_CMD,
        std::time::Duration::from_secs(12),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(crate::metrics::parse(&out))
}

#[tauri::command]
pub fn add_vps(state: State<AppState>, vps: NewVps) -> Result<Vps, String> {
    let id = uuid::Uuid::new_v4().to_string();
    if matches!(vps.auth, AuthKind::Password) {
        if let Some(pw) = &vps.password {
            crate::store::set_vps_password(&id, pw).map_err(|e| e.to_string())?;
        }
    }
    let v = Vps {
        id,
        name: vps.name,
        host: vps.host,
        port: vps.port,
        user: vps.user,
        auth: vps.auth,
        tags: vps.tags,
        added_at: chrono::Utc::now().to_rfc3339(),
    };
    state.store.add_vps(v.clone()).map_err(|e| e.to_string())?;
    Ok(v)
}

#[tauri::command]
pub fn remove_vps(state: State<AppState>, id: String) -> Result<(), String> {
    state.store.remove_vps(&id).map_err(|e| e.to_string())
}

/// The OpenSSH public key line — embedded in the installer command.
#[tauri::command]
pub fn get_public_key() -> Result<String, String> {
    crate::store::public_key_line().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_webhooks(state: State<AppState>) -> Vec<WebhookRule> {
    state.store.webhooks()
}

#[tauri::command]
pub fn set_webhooks(state: State<AppState>, hooks: Vec<WebhookRule>) -> Result<(), String> {
    state.store.set_webhooks(hooks).map_err(|e| e.to_string())
}

/// Send a test notification to a webhook to verify it works.
#[tauri::command]
pub async fn test_webhook(rule: WebhookRule) -> Result<(), String> {
    crate::webhook::send(&rule, "Test VPS", "test notification ✓", "online")
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> crate::store::Settings {
    state.store.settings()
}

#[tauri::command]
pub fn set_settings(state: State<AppState>, settings: crate::store::Settings) -> Result<(), String> {
    state.store.set_settings(settings).map_err(|e| e.to_string())
}
