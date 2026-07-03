//! Persistence: VPS list + settings in a JSON file, and the app's SSH private
//! key + any VPS passwords in the OS keyring (Keychain / Credential Manager /
//! Secret Service).

use std::path::PathBuf;
use std::sync::Mutex;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use crate::ssh;

const KEYRING_SERVICE: &str = "com.enowdev.enowxwatcher";
const KEY_ENTRY: &str = "ssh-private-key";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuthKind {
    Key,
    Password,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vps {
    pub id: String,
    pub name: String,
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    pub user: String,
    #[serde(default = "default_auth")]
    pub auth: AuthKind,
    #[serde(default)]
    pub tags: Vec<String>,
    pub added_at: String,
}
fn default_port() -> u16 {
    22
}
fn default_auth() -> AuthKind {
    AuthKind::Key
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookRule {
    pub id: String,
    pub url: String,
    pub kind: String, // "discord" | "slack" | "generic"
    #[serde(default)]
    pub vps_id: Option<String>, // None = all
    pub triggers: Vec<Trigger>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_cooldown")]
    pub cooldown_secs: u64,
}
fn default_true() -> bool {
    true
}
fn default_cooldown() -> u64 {
    300
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "value", rename_all = "lowercase")]
pub enum Trigger {
    Offline,
    Online,
    CpuAbove(f32),
    MemAbove(f32),
    DiskAbove(f32),
    LoadAbove(f32),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default = "default_interval")]
    pub poll_interval_secs: u64,
}
fn default_interval() -> u64 {
    15
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            poll_interval_secs: default_interval(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    #[serde(default)]
    pub vpses: Vec<Vps>,
    #[serde(default)]
    pub webhooks: Vec<WebhookRule>,
    #[serde(default)]
    pub settings: Settings,
}

/// Thread-safe config store backed by a JSON file. Loaded once at startup.
pub struct Store {
    path: PathBuf,
    inner: Mutex<Config>,
}

impl Store {
    pub fn load() -> Result<Self> {
        let dir = dirs::config_dir()
            .ok_or_else(|| anyhow!("no config dir"))?
            .join("enowxwatcher");
        std::fs::create_dir_all(&dir).ok();
        let path = dir.join("config.json");
        let cfg = if path.exists() {
            let raw = std::fs::read_to_string(&path)?;
            serde_json::from_str(&raw).unwrap_or_default()
        } else {
            Config::default()
        };
        Ok(Self {
            path,
            inner: Mutex::new(cfg),
        })
    }

    fn persist(&self, cfg: &Config) -> Result<()> {
        let json = serde_json::to_string_pretty(cfg)?;
        std::fs::write(&self.path, json)?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn snapshot(&self) -> Config {
        self.inner.lock().unwrap().clone()
    }

    pub fn vpses(&self) -> Vec<Vps> {
        self.inner.lock().unwrap().vpses.clone()
    }

    pub fn settings(&self) -> Settings {
        self.inner.lock().unwrap().settings.clone()
    }

    pub fn add_vps(&self, vps: Vps) -> Result<()> {
        let mut c = self.inner.lock().unwrap();
        c.vpses.retain(|v| v.id != vps.id);
        c.vpses.push(vps);
        self.persist(&c)
    }

    pub fn remove_vps(&self, id: &str) -> Result<()> {
        let mut c = self.inner.lock().unwrap();
        c.vpses.retain(|v| v.id != id);
        self.persist(&c)
    }

    pub fn set_webhooks(&self, hooks: Vec<WebhookRule>) -> Result<()> {
        let mut c = self.inner.lock().unwrap();
        c.webhooks = hooks;
        self.persist(&c)
    }

    pub fn webhooks(&self) -> Vec<WebhookRule> {
        self.inner.lock().unwrap().webhooks.clone()
    }

    pub fn set_settings(&self, s: Settings) -> Result<()> {
        let mut c = self.inner.lock().unwrap();
        c.settings = s;
        self.persist(&c)
    }
}

// ---- Keyring: SSH private key -----------------------------------------------

fn key_entry() -> Result<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEY_ENTRY).map_err(|e| anyhow!("keyring: {e}"))
}

/// Return the app's SSH private key PEM, generating + storing one on first use.
pub fn get_or_create_private_key() -> Result<String> {
    let entry = key_entry()?;
    match entry.get_password() {
        Ok(pem) => Ok(pem),
        Err(_) => {
            let (pem, _public) = ssh::generate_keypair()?;
            entry
                .set_password(&pem)
                .map_err(|e| anyhow!("keyring set: {e}"))?;
            Ok(pem)
        }
    }
}

/// Return the OpenSSH public key line for the installer command.
pub fn public_key_line() -> Result<String> {
    let pem = get_or_create_private_key()?;
    ssh::public_from_pem(&pem)
}

// ---- Keyring: per-VPS password ---------------------------------------------

pub fn set_vps_password(vps_id: &str, password: &str) -> Result<()> {
    keyring::Entry::new(KEYRING_SERVICE, &format!("pw-{vps_id}"))
        .map_err(|e| anyhow!("keyring: {e}"))?
        .set_password(password)
        .map_err(|e| anyhow!("keyring set: {e}"))
}

pub fn get_vps_password(vps_id: &str) -> Result<String> {
    keyring::Entry::new(KEYRING_SERVICE, &format!("pw-{vps_id}"))
        .map_err(|e| anyhow!("keyring: {e}"))?
        .get_password()
        .map_err(|e| anyhow!("keyring get: {e}"))
}
