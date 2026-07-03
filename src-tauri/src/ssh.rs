//! Minimal async SSH client (russh) used to run the metric command on a VPS and
//! to generate/serialize the app's Ed25519 keypair.

use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Result};
use russh::client::{self, Handle};
use russh::ChannelMsg;
use russh_keys::key::{self, KeyPair};
use russh_keys::PublicKeyBase64;

/// How we authenticate to a host.
#[derive(Clone)]
pub enum Auth {
    /// Ed25519 private key in OpenSSH PEM form (from the OS keyring).
    Key(String),
    Password(String),
}

/// A no-op handler: we don't pin host keys (this is a monitoring tool for hosts
/// the user owns). Accept any server key.
struct Client;

#[async_trait::async_trait]
impl client::Handler for Client {
    type Error = russh::Error;
    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

/// Connect, authenticate, run `command`, and return its stdout. A single call is
/// one full SSH session (connect→auth→exec→close); the poller runs these in
/// parallel with a timeout so one slow host never blocks the others.
pub async fn run_command(
    host: &str,
    port: u16,
    user: &str,
    auth: &Auth,
    command: &str,
    timeout: Duration,
) -> Result<String> {
    tokio::time::timeout(timeout, run_command_inner(host, port, user, auth, command))
        .await
        .map_err(|_| anyhow!("timed out"))?
}

async fn run_command_inner(
    host: &str,
    port: u16,
    user: &str,
    auth: &Auth,
    command: &str,
) -> Result<String> {
    let config = Arc::new(client::Config::default());
    let mut session: Handle<Client> = client::connect(config, (host, port), Client)
        .await
        .map_err(|e| anyhow!("connect: {e}"))?;

    let authed = match auth {
        Auth::Key(pem) => {
            let key = russh_keys::decode_secret_key(pem, None)
                .map_err(|e| anyhow!("bad key: {e}"))?;
            session
                .authenticate_publickey(user, Arc::new(key))
                .await
                .map_err(|e| anyhow!("auth: {e}"))?
        }
        Auth::Password(pw) => session
            .authenticate_password(user, pw)
            .await
            .map_err(|e| anyhow!("auth: {e}"))?,
    };
    if !authed {
        return Err(anyhow!("authentication rejected"));
    }

    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|e| anyhow!("open channel: {e}"))?;
    channel
        .exec(true, command)
        .await
        .map_err(|e| anyhow!("exec: {e}"))?;

    let mut out = Vec::new();
    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::Data { ref data } => out.extend_from_slice(data),
            ChannelMsg::ExitStatus { .. } => {}
            ChannelMsg::Eof | ChannelMsg::Close => break,
            _ => {}
        }
    }
    Ok(String::from_utf8_lossy(&out).into_owned())
}

/// Generate a fresh Ed25519 keypair and return (private_pem, public_openssh).
/// The private PEM goes to the OS keyring; the public line goes into the VPS's
/// authorized_keys via the installer.
pub fn generate_keypair() -> Result<(String, String)> {
    let kp = KeyPair::generate_ed25519().ok_or_else(|| anyhow!("keygen failed"))?;
    let mut buf = Vec::new();
    russh_keys::encode_pkcs8_pem(&kp, &mut buf).map_err(|e| anyhow!("encode key: {e}"))?;
    let pem = String::from_utf8(buf).map_err(|e| anyhow!("pem utf8: {e}"))?;
    let public = public_openssh(&kp)?;
    Ok((pem, public))
}

/// Render the OpenSSH one-line public key ("ssh-ed25519 AAAA... enowxwatcher").
pub fn public_openssh(kp: &KeyPair) -> Result<String> {
    let b64 = kp.public_key_base64();
    Ok(format!("{} {} enowxwatcher", kp.name(), b64))
}

/// Derive the public OpenSSH line from a stored private PEM (so we can show the
/// installer command after a restart without regenerating the key).
pub fn public_from_pem(pem: &str) -> Result<String> {
    let kp = russh_keys::decode_secret_key(pem, None).map_err(|e| anyhow!("bad key: {e}"))?;
    public_openssh(&kp)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn keygen_produces_openssh_line() {
        let (pem, publine) = generate_keypair().unwrap();
        assert!(pem.contains("PRIVATE KEY"), "pem: {}", &pem[..40]);
        assert!(publine.starts_with("ssh-ed25519 "), "pub: {publine}");
        // round-trip: derive public from pem again → same
        let again = public_from_pem(&pem).unwrap();
        assert_eq!(publine, again);
    }
}
