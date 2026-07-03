import TrayView from "./views/Tray.tsx";
import AppView from "./views/App.tsx";

// The same bundle powers two windows: the tray popover (label "tray") and the
// main window. Tauri sets ?view=tray on the popover window's URL.
export default function Root() {
  const isTray = new URLSearchParams(window.location.search).get("view") === "tray";
  if (isTray) {
    document.body.classList.add("tray");
    return <TrayView />;
  }
  return <AppView />;
}
