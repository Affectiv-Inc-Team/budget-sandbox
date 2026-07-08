import { useState, useEffect } from "react";
import { loadConfig, saveConfig, getMyCompanyScopes } from "../supabase.js";
import FinancialTool from "./FinancialTool.jsx";

export default function ToolPage({ userRole, userEmail, onSignOut }) {
  const [initialConfig, setInitialConfig] = useState(undefined);
  // companyId -> { accessRole, serviceLineScope } for the signed-in member.
  // Loaded alongside the config so FinancialTool never renders an unscoped
  // service-line strip before the scope is known.
  const [memberScopes, setMemberScopes] = useState({});

  useEffect(() => {
    Promise.all([loadConfig(), getMyCompanyScopes()]).then(([cfg, scopes]) => {
      setInitialConfig(cfg ?? null);
      setMemberScopes(scopes);
    });
  }, []);

  if (initialConfig === undefined) return null;

  return (
    <FinancialTool
      initialConfig={initialConfig}
      onSave={saveConfig}
      userRole={userRole}
      userEmail={userEmail}
      onSignOut={onSignOut}
      memberScopes={memberScopes}
    />
  );
}
