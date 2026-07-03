import { useEffect, useState } from "react";
import { Copy, Loader2, Check } from "lucide-react";
import { api, onEnroll, type NewVps } from "../../lib/api.ts";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog.tsx";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { Label } from "../ui/label.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs.tsx";

const REPO = "enowdev/enowxwatcher";

export function AddVpsDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: () => void;
}) {
  const [form, setForm] = useState<NewVps>({
    name: "",
    host: "",
    port: 22,
    user: "enowx-monitor",
    auth: "key",
    tags: [],
  });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [pubkey, setPubkey] = useState("");
  const [copied, setCopied] = useState(false);

  // Load the app public key for the installer command.
  useEffect(() => {
    if (open) api.getPublicKey().then(setPubkey).catch(() => setPubkey(""));
  }, [open]);

  // Deep-link enrollment: prefill the form when a VPS reports in.
  useEffect(() => {
    const un = onEnroll((f) => {
      setForm((prev) => ({
        ...prev,
        name: f.name || prev.name || f.host || "",
        host: f.host || "",
        user: f.user || "enowx-monitor",
        port: f.port ? Number(f.port) : 22,
        auth: "key",
      }));
      onOpenChange(true);
    });
    return () => {
      un.then((fn) => fn());
    };
  }, [onOpenChange]);

  const installCmd = pubkey
    ? `curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | sudo sh -s -- "${pubkey}"`
    : "Generating key…";

  async function save() {
    if (!form.host || !form.name) {
      setStatus("Name and host are required.");
      return;
    }
    setBusy(true);
    setStatus("Testing connection…");
    try {
      await api.testConnection(form);
      await api.addVps(form);
      setStatus("");
      onAdded();
      onOpenChange(false);
      setForm({ ...form, name: "", host: "" });
    } catch (e) {
      setStatus(`Failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  function copyCmd() {
    navigator.clipboard.writeText(installCmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Add a VPS</DialogTitle>
        <DialogDescription>Run the installer, or add a host manually.</DialogDescription>

        <Tabs defaultValue="script" className="mt-4">
          <TabsList className="w-full">
            <TabsTrigger value="script" className="flex-1">
              Via script
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex-1">
              Manual
            </TabsTrigger>
          </TabsList>

          <TabsContent value="script" className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Run this on the VPS (as root). It creates a restricted monitor user and prints a link to paste back —
              the app will pre-fill this form automatically.
            </p>
            <div className="relative">
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 pr-10 text-[11px] leading-relaxed">
                {installCmd}
              </pre>
              <button
                onClick={copyCmd}
                className="absolute right-2 top-2 rounded p-1.5 text-muted-foreground hover:bg-accent"
                aria-label="Copy"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              After running it, the app receives the connection via the <code>enowxwatcher://</code> link. Or switch to
              Manual and enter the printed host.
            </p>
          </TabsContent>

          <TabsContent value="manual" className="mt-4 space-y-3">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My VPS" />
            </Field>
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <Field label="Host (IP)">
                <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="1.2.3.4" />
              </Field>
              <Field label="Port">
                <Input
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                />
              </Field>
            </div>
            <Field label="User">
              <Input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} />
            </Field>
            <Field label="Tags (comma separated)">
              <Input
                placeholder="prod, db"
                onChange={(e) =>
                  setForm({ ...form, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
                }
              />
            </Field>
          </TabsContent>
        </Tabs>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Add & verify
          </Button>
          {status && <span className="text-xs text-muted-foreground">{status}</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <Label>{label}</Label>
      {children}
    </label>
  );
}
