import { useEffect, useState } from "react";
import { enable, isEnabled, disable } from "@tauri-apps/plugin-autostart";
import { api } from "../../lib/api.ts";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.tsx";
import { Label } from "../ui/label.tsx";
import { Input } from "../ui/input.tsx";
import { Switch } from "../ui/switch.tsx";
import { Button } from "../ui/button.tsx";

export function SettingsTab() {
  const [interval, setInterval] = useState(15);
  const [autostart, setAutostart] = useState(false);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    api.getSettings().then((s) => setInterval(s.poll_interval_secs));
    isEnabled().then(setAutostart).catch(() => setAutostart(false));
  }, []);

  async function toggleAutostart(v: boolean) {
    try {
      if (v) await enable();
      else await disable();
      setAutostart(v);
    } catch {
      /* ignore */
    }
  }

  async function save() {
    await api.setSettings({ poll_interval_secs: Math.max(5, interval) });
    setSaved("Saved");
    setTimeout(() => setSaved(""), 1500);
  }

  return (
    <div className="max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Start at login</Label>
              <p className="text-[11px] text-muted-foreground">Launch enowxwatcher to the tray on boot.</p>
            </div>
            <Switch checked={autostart} onCheckedChange={toggleAutostart} />
          </div>
          <div className="space-y-1.5">
            <Label>Poll interval (seconds)</Label>
            <Input
              type="number"
              min={5}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              className="w-32"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={save}>Save</Button>
            {saved && <span className="text-xs text-muted-foreground">{saved}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
