//! Remote process listing + control over SSH.
//!
//! NOTE: the restricted `enowx-monitor` user (installed by install.sh) can only
//! run the metric script — it cannot list arbitrary processes or kill. These
//! commands therefore only work on hosts the app connects to with a fuller
//! account (e.g. root/password auth or your own key). The UI surfaces the error
//! when the account is too restricted.

use serde::Serialize;

/// One process row.
#[derive(Debug, Clone, Serialize)]
pub struct Proc {
    pub pid: u32,
    pub user: String,
    pub cpu: f32,
    pub mem: f32,
    pub command: String,
}

/// `ps` in a stable, parseable form: pid, user, %cpu, %mem, then the full command
/// (which may contain spaces, so it's last). Sorted by CPU desc, top 200.
pub const LIST_CMD: &str =
    "ps -eo pid=,user=,pcpu=,pmem=,args= --sort=-pcpu 2>/dev/null | head -n 200";

/// Parse the output of `LIST_CMD`.
pub fn parse(out: &str) -> Vec<Proc> {
    let mut v = Vec::new();
    for line in out.lines() {
        // Columns: pid user %cpu %mem command… (command is the rest of the line).
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 5 {
            continue;
        }
        let pid: u32 = match cols[0].parse() {
            Ok(p) => p,
            Err(_) => continue,
        };
        let user = cols[1].to_string();
        let cpu: f32 = cols[2].parse().unwrap_or(0.0);
        let mem: f32 = cols[3].parse().unwrap_or(0.0);
        // command = everything after the 4th column
        let command = cols[4..].join(" ");
        v.push(Proc { pid, user, cpu, mem, command });
    }
    v
}

/// Build the kill command. `signal` is "TERM" (graceful) or "KILL" (force).
pub fn kill_cmd(pid: u32, signal: &str) -> String {
    let sig = if signal.eq_ignore_ascii_case("kill") { "KILL" } else { "TERM" };
    format!("kill -{sig} {pid} 2>&1")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ps_output() {
        let sample = "\
  1234 root      12.5  3.4 /usr/bin/postgres -D /var/lib/postgresql
    42 www-data   0.0  1.1 nginx: worker process
   999 ubuntu     5.0  0.5 sshd: ubuntu@pts/0";
        let procs = parse(sample);
        assert_eq!(procs.len(), 3);
        assert_eq!(procs[0].pid, 1234);
        assert_eq!(procs[0].user, "root");
        assert!((procs[0].cpu - 12.5).abs() < 0.01);
        assert!(procs[0].command.contains("postgres"));
        assert!(procs[1].command.contains("nginx: worker"));
    }

    #[test]
    fn kill_signals() {
        assert!(kill_cmd(42, "term").contains("-TERM 42"));
        assert!(kill_cmd(42, "kill").contains("-KILL 42"));
    }
}
