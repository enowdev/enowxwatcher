//! Webhook alerting: evaluate rules against fresh metrics (edge-triggered with a
//! cooldown) and POST notifications to Discord / Slack / a generic endpoint.

use crate::metrics::VpsMetrics;
use crate::poller::Runtime;
use crate::store::{Trigger, Vps, WebhookRule};

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Which triggers fired for one VPS this cycle, given its previous online state.
fn fired(rule: &WebhookRule, m: &VpsMetrics, was_online: bool) -> Option<(&'static str, String)> {
    for t in &rule.triggers {
        match t {
            Trigger::Offline if !m.online && was_online => {
                return Some(("offline", "is DOWN".into()))
            }
            Trigger::Online if m.online && !was_online => {
                return Some(("online", "has recovered".into()))
            }
            Trigger::CpuAbove(n) if m.online && m.cpu_pct >= *n => {
                return Some(("cpu", format!("CPU {:.0}% (≥{:.0}%)", m.cpu_pct, n)))
            }
            Trigger::MemAbove(n) if m.online && mem_pct(m) >= *n => {
                return Some(("mem", format!("MEM {:.0}% (≥{:.0}%)", mem_pct(m), n)))
            }
            Trigger::DiskAbove(n) if m.online && disk_pct(m) >= *n => {
                return Some(("disk", format!("DISK {:.0}% (≥{:.0}%)", disk_pct(m), n)))
            }
            Trigger::LoadAbove(n) if m.online && m.load[0] >= *n => {
                return Some(("load", format!("load {:.2} (≥{:.2})", m.load[0], n)))
            }
            _ => {}
        }
    }
    None
}

fn mem_pct(m: &VpsMetrics) -> f32 {
    if m.mem_total_mb == 0 {
        0.0
    } else {
        100.0 * m.mem_used_mb as f32 / m.mem_total_mb as f32
    }
}
fn disk_pct(m: &VpsMetrics) -> f32 {
    if m.disk_total_gb <= 0.0 {
        0.0
    } else {
        100.0 * m.disk_used_gb / m.disk_total_gb
    }
}

/// Evaluate all rules against this cycle's results and fire notifications.
pub fn evaluate(rt: &mut Runtime, rules: &[WebhookRule], vpses: &[Vps], results: &[(String, VpsMetrics)]) {
    let now = now_secs();
    for (id, m) in results {
        let name = vpses
            .iter()
            .find(|v| &v.id == id)
            .map(|v| v.name.clone())
            .unwrap_or_else(|| id.clone());
        let was_online = *rt.prev_online.get(id).unwrap_or(&true);

        for rule in rules {
            if !rule.enabled {
                continue;
            }
            if let Some(target) = &rule.vps_id {
                if target != id {
                    continue;
                }
            }
            if let Some((kind, detail)) = fired(rule, m, was_online) {
                // Cooldown per (rule, vps, kind).
                let ck = format!("{}|{}|{}", rule.id, id, kind);
                let last = rt.webhook_last.get(&ck).copied().unwrap_or(0);
                let is_state = kind == "offline" || kind == "online";
                if !is_state && now.saturating_sub(last) < rule.cooldown_secs {
                    continue;
                }
                rt.webhook_last.insert(ck, now);
                dispatch(rule.clone(), name.clone(), detail, kind);
            }
        }

        rt.prev_online.insert(id.clone(), m.online);
    }
}

/// Fire-and-forget send (spawned so it never blocks the poll loop).
fn dispatch(rule: WebhookRule, vps_name: String, detail: String, kind: &'static str) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = send(&rule, &vps_name, &detail, kind).await {
            eprintln!("[webhook] send failed: {e}");
        }
    });
}

/// Build + POST the payload for a rule's target kind.
pub async fn send(rule: &WebhookRule, vps_name: &str, detail: &str, kind: &str) -> anyhow::Result<()> {
    let client = reqwest::Client::new();
    let (emoji, color) = match kind {
        "offline" => ("🔴", 0xE0245Eu32),
        "online" => ("🟢", 0x2ECC71),
        _ => ("🟡", 0xF1C40F),
    };
    let title = format!("{emoji} {vps_name} {detail}");

    let body = match rule.kind.as_str() {
        "discord" => serde_json::json!({
            "embeds": [{
                "title": title,
                "color": color,
                "footer": { "text": "enowxwatcher" },
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }]
        }),
        "slack" => serde_json::json!({ "text": title }),
        _ => serde_json::json!({
            "vps": vps_name, "event": kind, "detail": detail,
            "message": title, "ts": chrono::Utc::now().to_rfc3339(),
        }),
    };

    client.post(&rule.url).json(&body).send().await?;
    Ok(())
}
