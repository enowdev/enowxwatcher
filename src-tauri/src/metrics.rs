//! Metric collection: one remote shell command gathers everything, and a parser
//! turns its output into a `VpsMetrics`. Keeping it to a single command means one
//! SSH round-trip per poll.

use serde::{Deserialize, Serialize};

/// The command run on the VPS. It reads two /proc/stat + /proc/net/dev samples
/// 1s apart (for CPU% and net rate), plus memory, disk, uptime, and load. Output
/// is line-delimited and prefixed so the parser is order-independent.
pub const METRIC_CMD: &str = r#"
cat /proc/stat | grep '^cpu ' | sed 's/^/CPU1 /'
cat /proc/net/dev | grep -v -E 'lo:|face' | awk '{rx+=$2; tx+=$10} END{print "NET1", rx, tx}'
sleep 1
cat /proc/stat | grep '^cpu ' | sed 's/^/CPU2 /'
cat /proc/net/dev | grep -v -E 'lo:|face' | awk '{rx+=$2; tx+=$10} END{print "NET2", rx, tx}'
grep -E 'MemTotal|MemAvailable' /proc/meminfo | sed 's/^/MEM /'
df -k --output=size,used / | tail -1 | sed 's/^/DISK /'
cat /proc/uptime | sed 's/^/UP /'
cat /proc/loadavg | sed 's/^/LOAD /'
"#;

/// A point-in-time snapshot of a VPS's health.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VpsMetrics {
    pub online: bool,
    pub cpu_pct: f32,
    pub mem_used_mb: u64,
    pub mem_total_mb: u64,
    pub disk_used_gb: f32,
    pub disk_total_gb: f32,
    pub net_rx_kbps: f32,
    pub net_tx_kbps: f32,
    pub load: [f32; 3],
    pub uptime_secs: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Parse the output of `METRIC_CMD` into metrics. Returns None only if the
/// output is unusable; missing individual fields default to 0.
pub fn parse(out: &str) -> VpsMetrics {
    let mut m = VpsMetrics {
        online: true,
        ..Default::default()
    };

    let mut cpu1: Option<(u64, u64)> = None; // (idle, total)
    let mut cpu2: Option<(u64, u64)> = None;
    let mut net1: Option<(u64, u64)> = None;
    let mut net2: Option<(u64, u64)> = None;
    let mut mem_total_kb = 0u64;
    let mut mem_avail_kb = 0u64;

    for line in out.lines() {
        let f: Vec<&str> = line.split_whitespace().collect();
        if f.is_empty() {
            continue;
        }
        match f[0] {
            "CPU1" | "CPU2" => {
                // CPUn cpu user nice system idle iowait irq softirq steal ...
                let nums: Vec<u64> = f[2..].iter().filter_map(|s| s.parse().ok()).collect();
                if nums.len() >= 4 {
                    let idle = nums[3] + nums.get(4).copied().unwrap_or(0); // idle + iowait
                    let total: u64 = nums.iter().sum();
                    if f[0] == "CPU1" {
                        cpu1 = Some((idle, total));
                    } else {
                        cpu2 = Some((idle, total));
                    }
                }
            }
            "NET1" | "NET2" => {
                if f.len() >= 3 {
                    let rx = f[1].parse().unwrap_or(0);
                    let tx = f[2].parse().unwrap_or(0);
                    if f[0] == "NET1" {
                        net1 = Some((rx, tx));
                    } else {
                        net2 = Some((rx, tx));
                    }
                }
            }
            "MEM" => {
                // MEM MemTotal: 12345 kB
                if f.len() >= 3 {
                    let val: u64 = f[2].parse().unwrap_or(0);
                    if f[1].starts_with("MemTotal") {
                        mem_total_kb = val;
                    } else if f[1].starts_with("MemAvailable") {
                        mem_avail_kb = val;
                    }
                }
            }
            "DISK" => {
                // DISK <size_kb> <used_kb>
                if f.len() >= 3 {
                    let size_kb: f64 = f[1].parse().unwrap_or(0.0);
                    let used_kb: f64 = f[2].parse().unwrap_or(0.0);
                    m.disk_total_gb = (size_kb / 1024.0 / 1024.0) as f32;
                    m.disk_used_gb = (used_kb / 1024.0 / 1024.0) as f32;
                }
            }
            "UP" => {
                if f.len() >= 2 {
                    m.uptime_secs = f[1].parse::<f64>().unwrap_or(0.0) as u64;
                }
            }
            "LOAD" => {
                // LOAD 0.35 0.41 0.35 ...
                for i in 0..3 {
                    m.load[i] = f.get(i + 1).and_then(|s| s.parse().ok()).unwrap_or(0.0);
                }
            }
            _ => {}
        }
    }

    // CPU%: from the delta between the two /proc/stat samples.
    if let (Some((i1, t1)), Some((i2, t2))) = (cpu1, cpu2) {
        let dt = t2.saturating_sub(t1);
        let di = i2.saturating_sub(i1);
        if dt > 0 {
            m.cpu_pct = (100.0 * (1.0 - di as f32 / dt as f32)).clamp(0.0, 100.0);
        }
    }

    // Memory: used = total - available.
    if mem_total_kb > 0 {
        m.mem_total_mb = mem_total_kb / 1024;
        let used_kb = mem_total_kb.saturating_sub(mem_avail_kb);
        m.mem_used_mb = used_kb / 1024;
    }

    // Net rate: bytes/s over the ~1s window → kbps (kilobytes/s).
    if let (Some((rx1, tx1)), Some((rx2, tx2))) = (net1, net2) {
        m.net_rx_kbps = rx2.saturating_sub(rx1) as f32 / 1024.0;
        m.net_tx_kbps = tx2.saturating_sub(tx1) as f32 / 1024.0;
    }

    m
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_full_sample() {
        let sample = "\
CPU1 cpu 100 0 50 1000 20 0 5 0
NET1 1000000 500000
CPU2 cpu 130 0 60 1180 24 0 6 0
NET2 1102400 600000
MEM MemTotal: 12000000 kB
MEM MemAvailable: 9000000 kB
DISK 41943040 5242880
UP 123456.78 100000.00
LOAD 0.35 0.41 0.35 1/262 57444";
        let m = parse(sample);
        assert!(m.online);
        // total delta = 1400-1175 = 225, idle delta = 1204-1020 = 184
        // cpu% = 100*(1 - 184/225) ≈ 18.2%
        assert!((m.cpu_pct - 18.2).abs() < 1.0, "cpu {}", m.cpu_pct);
        assert_eq!(m.mem_total_mb, 12000000 / 1024);
        assert_eq!(m.mem_used_mb, (12000000 - 9000000) / 1024);
        assert!((m.disk_total_gb - 40.0).abs() < 0.5, "disk {}", m.disk_total_gb);
        assert_eq!(m.uptime_secs, 123456);
        assert_eq!(m.load[0], 0.35);
        // net rx delta 102400 bytes / 1024 = 100 kB/s
        assert!((m.net_rx_kbps - 100.0).abs() < 1.0, "rx {}", m.net_rx_kbps);
    }
}
