import { useEffect, useState } from "react";
import { Plus, Trash2, Send, Loader2 } from "lucide-react";
import { api, type Vps, type WebhookRule, type Trigger } from "../../lib/api.ts";
import { Card, CardContent } from "../ui/card.tsx";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { Label } from "../ui/label.tsx";
import { Switch } from "../ui/switch.tsx";
import { Badge } from "../ui/badge.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.tsx";

const KINDS = ["discord", "slack", "generic"] as const;

function newRule(): WebhookRule {
  return {
    id: crypto.randomUUID(),
    url: "",
    kind: "discord",
    vps_id: null,
    triggers: [{ type: "offline" }, { type: "online" }],
    enabled: true,
    cooldown_secs: 300,
  };
}

export function WebhooksTab({ vpses }: { vpses: Vps[] }) {
  const [rules, setRules] = useState<WebhookRule[]>([]);
  const [testing, setTesting] = useState<string>("");

  useEffect(() => {
    api.listWebhooks().then(setRules);
  }, []);

  async function persist(next: WebhookRule[]) {
    setRules(next);
    await api.setWebhooks(next);
  }

  function update(id: string, patch: Partial<WebhookRule>) {
    persist(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function toggleTrigger(rule: WebhookRule, t: Trigger["type"]) {
    const has = rule.triggers.some((x) => x.type === t);
    const triggers = has
      ? rule.triggers.filter((x) => x.type !== t)
      : [...rule.triggers, defaultTrigger(t)];
    update(rule.id, { triggers });
  }

  async function test(rule: WebhookRule) {
    if (!rule.url) return;
    setTesting(rule.id);
    try {
      await api.testWebhook(rule);
    } catch {
      /* ignore */
    } finally {
      setTimeout(() => setTesting(""), 800);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => persist([...rules, newRule()])}>
          <Plus className="h-4 w-4" /> Add webhook
        </Button>
      </div>

      {rules.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No webhooks yet. Add one to get alerts on Discord, Slack, or any endpoint.
        </p>
      )}

      {rules.map((r) => (
        <Card key={r.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Switch checked={r.enabled} onCheckedChange={(v) => update(r.id, { enabled: v })} />
              <Select value={r.kind} onValueChange={(v) => update(r.id, { kind: v as WebhookRule["kind"] })}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k} className="capitalize">
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => test(r)} aria-label="Test">
                  {testing === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => persist(rules.filter((x) => x.id !== r.id))}
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Webhook URL</Label>
              <Input
                value={r.url}
                onChange={(e) => update(r.id, { url: e.target.value })}
                placeholder="https://discord.com/api/webhooks/…"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Target VPS</Label>
                <Select
                  value={r.vps_id ?? "all"}
                  onValueChange={(v) => update(r.id, { vps_id: v === "all" ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All VPS</SelectItem>
                    {vpses.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cooldown (seconds)</Label>
                <Input
                  type="number"
                  value={r.cooldown_secs}
                  onChange={(e) => update(r.id, { cooldown_secs: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Triggers</Label>
              <div className="flex flex-wrap gap-1.5">
                {(["offline", "online", "cpuabove", "memabove", "diskabove", "loadabove"] as const).map((t) => {
                  const on = r.triggers.some((x) => x.type === t);
                  return (
                    <button key={t} onClick={() => toggleTrigger(r, t)}>
                      <Badge variant={on ? "default" : "outline"} className="cursor-pointer capitalize">
                        {label(t)}
                      </Badge>
                    </button>
                  );
                })}
              </div>
              {/* thresholds for the *above triggers */}
              {r.triggers
                .filter((t) => "value" in t)
                .map((t) => (
                  <div key={t.type} className="flex items-center gap-2 pt-1">
                    <span className="w-24 text-[11px] capitalize text-muted-foreground">{label(t.type)}</span>
                    <Input
                      type="number"
                      className="h-7 w-24"
                      value={(t as { value: number }).value}
                      onChange={(e) =>
                        update(r.id, {
                          triggers: r.triggers.map((x) =>
                            x.type === t.type ? ({ ...x, value: Number(e.target.value) } as Trigger) : x,
                          ),
                        })
                      }
                    />
                    <span className="text-[11px] text-muted-foreground">%</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function defaultTrigger(t: Trigger["type"]): Trigger {
  switch (t) {
    case "offline":
      return { type: "offline" };
    case "online":
      return { type: "online" };
    case "cpuabove":
      return { type: "cpuabove", value: 85 };
    case "memabove":
      return { type: "memabove", value: 90 };
    case "diskabove":
      return { type: "diskabove", value: 85 };
    case "loadabove":
      return { type: "loadabove", value: 4 };
  }
}

function label(t: string): string {
  return t.replace("above", " >");
}
