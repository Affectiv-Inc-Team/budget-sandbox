import { useState, useEffect } from "react";
import { loadConfig, saveConfig } from "../supabase.js";
import FinancialTool from "./FinancialTool.jsx";

export default function ToolPage({ userRole, userEmail, onSignOut }) {
  const [initialConfig, setInitialConfig] = useState(undefined);

  useEffect(() => {
    loadConfig().then((cfg) => setInitialConfig(cfg ?? null));
  }, []);

  if (initialConfig === undefined) return null;

  return (
    <FinancialTool
      initialConfig={initialConfig}
      onSave={saveConfig}
      userRole={userRole}
      userEmail={userEmail}
      onSignOut={onSignOut}
    />
  );
}
