//! Background poller: every `interval` seconds it SSHes every VPS in parallel,
//! parses metrics, keeps a short in-memory history for sparklines, evaluates
//! webhook rules, and emits a `metrics-updated` event to the frontend.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::metrics::{self, VpsMetrics};
use crate::ssh::{self, Auth};
use crate::store::{AuthKind, Store, Vps};
use crate::webhook;

const HISTORY_LEN: usize = 60;
const SSH_TIMEOUT: Duration = Duration::from_secs(12);

#[derive(Clone, Serialize)]
pub struct VpsStatus {
    pub vps_id: String,
    #[serde(flatten)]
    pub metrics: VpsMetrics,
    pub cpu_history: Vec<f32>,
    pub last_checked: String,
}

/// Shared runtime state the poller and commands both touch.
#[derive(Default)]
pub struct Runtime {
    /// latest status per vps id
    pub statuses: HashMap<String, VpsStatus>,
    /// short CPU history per vps id (for sparklines)
    pub cpu_history: HashMap<String, Vec<f32>>,
    /// previous online state per vps id (for webhook edge detection)
    pub prev_online: HashMap<String, bool>,
    /// last time each webhook rule fired (unix secs)
    pub webhook_last: HashMap<String, u64>,
}

pub type SharedRuntime = Arc<Mutex<Runtime>>;

/// Resolve a VPS's auth material (private key from keyring, or its password).
fn resolve_auth(v: &Vps) -> anyhow::Result<Auth> {
    match v.auth {
        AuthKind::Key => Ok(Auth::Key(crate::store::get_or_create_private_key()?)),
        AuthKind::Password => Ok(Auth::Password(crate::store::get_vps_password(&v.id)?)),
    }
}

/// Poll a single VPS once, returning its metrics (online=false + error on fail).
async fn poll_one(v: Vps) -> VpsMetrics {
    let auth = match resolve_auth(&v) {
        Ok(a) => a,
        Err(e) => {
            return VpsMetrics {
                online: false,
                error: Some(format!("auth: {e}")),
                ..Default::default()
            }
        }
    };
    match ssh::run_command(
        &v.host,
        v.port,
        &v.user,
        &auth,
        metrics::METRIC_CMD,
        SSH_TIMEOUT,
    )
    .await
    {
        Ok(out) => metrics::parse(&out),
        Err(e) => VpsMetrics {
            online: false,
            error: Some(e.to_string()),
            ..Default::default()
        },
    }
}

/// Run one full poll cycle for all VPSes (parallel), update runtime, emit event.
pub async fn poll_cycle(app: &AppHandle, store: &Store, rt: &SharedRuntime) {
    let vpses = store.vpses();
    if vpses.is_empty() {
        let _ = app.emit("metrics-updated", Vec::<VpsStatus>::new());
        return;
    }

    // Poll all in parallel.
    let handles: Vec<_> = vpses
        .iter()
        .cloned()
        .map(|v| {
            let id = v.id.clone();
            tokio::spawn(async move { (id, poll_one(v).await) })
        })
        .collect();

    let mut results = Vec::new();
    for h in handles {
        if let Ok((id, m)) = h.await {
            results.push((id, m));
        }
    }

    let now = chrono::Utc::now().to_rfc3339();
    let mut statuses = Vec::new();
    let webhooks = store.webhooks();
    {
        let mut g = rt.lock().await;
        for (id, m) in &results {
            // history
            let hist = g.cpu_history.entry(id.clone()).or_default();
            hist.push(m.cpu_pct);
            if hist.len() > HISTORY_LEN {
                let drop = hist.len() - HISTORY_LEN;
                hist.drain(0..drop);
            }
            let cpu_history = hist.clone();

            let status = VpsStatus {
                vps_id: id.clone(),
                metrics: m.clone(),
                cpu_history,
                last_checked: now.clone(),
            };
            g.statuses.insert(id.clone(), status.clone());
            statuses.push(status);
        }

        // Webhook evaluation (edge-triggered + cooldown) — needs &mut runtime.
        webhook::evaluate(&mut g, &webhooks, &vpses, &results);
    }

    let _ = app.emit("metrics-updated", &statuses);

    // Update tray tooltip with a compact summary.
    let online = results.iter().filter(|(_, m)| m.online).count();
    let total = results.len();
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_tooltip(Some(format!("enowxwatcher — {online}/{total} online")));
    }
}

/// Spawn the polling loop as a background task.
pub fn spawn(app: AppHandle, store: Arc<Store>, rt: SharedRuntime) {
    tauri::async_runtime::spawn(async move {
        loop {
            poll_cycle(&app, &store, &rt).await;
            let interval = store.settings().poll_interval_secs.max(5);
            tokio::time::sleep(Duration::from_secs(interval)).await;
        }
    });
}
