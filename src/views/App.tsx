import { useState } from "react";
import { LayoutGrid, Webhook, Settings as SettingsIcon, Plus, Sun, Moon } from "lucide-react";
import { api } from "../lib/api.ts";
import { useMonitor } from "../lib/useMonitor.ts";
import { useTheme } from "../lib/theme.ts";
import { cn } from "../lib/utils.ts";
import { Button } from "../components/ui/button.tsx";
import { VpsCard } from "../components/monitor/VpsCard.tsx";
import { AddVpsDialog } from "../components/monitor/AddVpsDialog.tsx";
import { WebhooksTab } from "../components/monitor/WebhooksTab.tsx";
import { SettingsTab } from "../components/monitor/SettingsTab.tsx";

type Tab = "dashboard" | "webhooks" | "settings";

export default function AppView() {
  const { vpses, statuses, reloadVpses } = useMonitor();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [addOpen, setAddOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();

  const online = vpses.filter((v) => statuses[v.id]?.online).length;

  return (
    <div className="flex h-full bg-background">
      <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-card/40 p-3">
        <div className="flex items-center gap-2 px-2 py-2">
          <img src="/ew.png" alt="ew" className="h-7 w-7 object-contain" />
          <span className="text-sm font-semibold">enowxwatcher</span>
        </div>
        <div className="mb-3 px-2 text-[11px] text-muted-foreground">
          {online}/{vpses.length} online
        </div>

        <nav className="flex flex-col gap-1">
          <NavBtn icon={LayoutGrid} label="Dashboard" active={tab === "dashboard"} onClick={() => setTab("dashboard")} />
          <NavBtn icon={Webhook} label="Webhooks" active={tab === "webhooks"} onClick={() => setTab("webhooks")} />
          <NavBtn icon={SettingsIcon} label="Settings" active={tab === "settings"} onClick={() => setTab("settings")} />
        </nav>

        <div className="mt-auto flex items-center justify-between px-1">
          <Button size="sm" variant="ghost" onClick={toggleTheme} aria-label="Theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </aside>

      <section className="flex-1 overflow-y-auto">
        <header className="flex items-center justify-between border-b border-border px-6 py-3">
          <h1 className="text-base font-semibold capitalize">{tab}</h1>
          {tab === "dashboard" && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add VPS
            </Button>
          )}
        </header>

        <div className="p-6">
          {tab === "dashboard" &&
            (vpses.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
                <p className="text-sm">No VPS yet.</p>
                <Button onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4" /> Add your first VPS
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {vpses.map((v) => (
                  <VpsCard
                    key={v.id}
                    vps={v}
                    status={statuses[v.id]}
                    onRemove={async () => {
                      await api.removeVps(v.id);
                      reloadVpses();
                    }}
                  />
                ))}
              </div>
            ))}
          {tab === "webhooks" && <WebhooksTab vpses={vpses} />}
          {tab === "settings" && <SettingsTab />}
        </div>
      </section>

      <AddVpsDialog open={addOpen} onOpenChange={setAddOpen} onAdded={reloadVpses} />
    </div>
  );
}

function NavBtn({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof LayoutGrid;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
