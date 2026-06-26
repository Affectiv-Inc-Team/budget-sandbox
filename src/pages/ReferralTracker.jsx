import { useState, useEffect, useMemo } from "react";
import { loadConfig } from "../supabase.js";
import { canUnmaskSSN } from "../lib/access.js";
import {
  listReferrals, getReferral, createReferral, updateReferral, addContact, revealSSN, setSSN,
} from "../lib/referrals.js";
import {
  buildDisplayLabel, isSaveable, softWarnings, labelFor, daysInStage,
  SOURCE_TYPES, INTAKE_METHODS, PRIORITIES, ALL_STAGES, PIPELINE_STAGES,
  SERVICES, SERVICE_LEVELS, PAY_SOURCES, LIVING_SITUATIONS, RISK_INDICATORS,
  REPEATABLE_CONTACT_KINDS, OUTCOMES,
} from "../lib/referralShape.js";
import { COMMON_MEDICATIONS, MEDICATION_FREQUENCIES } from "../data/medications.js";

const M = { fontFamily: "'DM Mono',monospace" };

// Fields stored on first-class columns; everything else goes into details jsonb.
const COLUMN_KEYS = [
  "stage", "priority", "source_type", "intake_method", "date_received",
  "referring_party", "first_name", "last_name", "preferred_name", "dob", "is_minor",
  "city", "county", "region", "state", "service_level", "pay_source", "tsc",
  "next_followup_date", "outcome", "outcome_reason", "decision_date", "client_record_link",
];

function emptyDraft() {
  return {
    stage: "NEW_INQUIRY", priority: "normal",
    source_type: "", intake_method: "", date_received: "",
    referring_party: { name: "", organization: "", role: "", phone: "", email: "" },
    first_name: "", last_name: "", preferred_name: "", dob: "", is_minor: undefined,
    gender: "", pronouns: "", ssn: "", medicaid_id: "", other_ids: "",
    city: "", county: "", region: "", state: "", address: "", living_situation: "",
    services: [], service_level: "", waiver: "", pay_source: "",
    tsc: { name: "", agency: "", phone: "", email: "" },
    authorized_units: "", target_start_date: "",
    diagnoses: "", behavior_notes: "", risk_indicators: [], medical_needs: "",
    mobility_adl: "", medications: [], psychotropic: false, communication_needs: "",
    self_guardian: undefined,
    guardian: { name: "", relationship: "", phone: "", email: "", address: "" },
    poa: "", housing_needed: undefined, preferred_location: "",
    potential_home_match: "", roommate_notes: "",
    next_followup_date: "", outcome: "", outcome_reason: "", decision_date: "",
    client_record_link: "",
    contactsDraft: [],
  };
}

// Split a draft into top-level columns + a details blob for the long tail.
function buildPayload(draft) {
  const out = { details: {} };
  for (const [k, v] of Object.entries(draft)) {
    if (k === "ssn" || k === "contactsDraft") continue;
    if (COLUMN_KEYS.includes(k)) out[k] = v;
    else out.details[k] = v;
  }
  return out;
}

// ─── Small styled primitives ────────────────────────────────────────────────

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #d5c898",
  background: "#fff", fontSize: 13, color: "#3a2800", boxSizing: "border-box",
  fontFamily: "'Sora',sans-serif",
};
const labelStyle = {
  fontSize: 9, color: "#7a6030", textTransform: "uppercase", letterSpacing: 1.1,
  fontWeight: 600, marginBottom: 4, display: "block",
};

function Field({ label, children }) {
  return (
    <label style={{ display: "block", flex: 1, minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function Text({ label, value, onChange, type = "text", placeholder, suggestions }) {
  const listId = suggestions ? `dl-${label.replace(/\W+/g, "-").toLowerCase()}` : undefined;
  return (
    <Field label={label}>
      <input type={type} value={type === "date" ? (value ?? "").slice(0, 10) : (value ?? "")} placeholder={placeholder} list={listId}
        onChange={e => onChange(e.target.value)} style={inputStyle} />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map(s => <option key={s} value={s} />)}
        </datalist>
      )}
    </Field>
  );
}

function Area({ label, value, onChange }) {
  return (
    <Field label={label}>
      <textarea value={value ?? ""} onChange={e => onChange(e.target.value)}
        rows={2} style={{ ...inputStyle, resize: "vertical" }} />
    </Field>
  );
}

function Select({ label, value, onChange, options, blank = "—" }) {
  return (
    <Field label={label}>
      <select value={value ?? ""} onChange={e => onChange(e.target.value)} style={inputStyle}>
        {blank !== null && <option value="">{blank}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

function TriToggle({ label, value, onChange }) {
  // undefined | true | false
  const opts = [["Unset", undefined], ["Yes", true], ["No", false]];
  return (
    <Field label={label}>
      <div style={{ display: "flex", gap: 4 }}>
        {opts.map(([lbl, val]) => (
          <button key={lbl} type="button" onClick={() => onChange(val)}
            style={{
              flex: 1, padding: "7px 0", borderRadius: 6, fontSize: 11, cursor: "pointer",
              border: "1px solid #d5c898", ...M,
              background: value === val ? "#D4A520" : "#fff",
              color: value === val ? "#fff" : "#7a6030", fontWeight: 700,
            }}>{lbl}</button>
        ))}
      </div>
    </Field>
  );
}

function Section({ title, hint, open, onToggle, children }) {
  return (
    <div style={{ background: "#f8f6f0", borderRadius: 11, border: "1px solid #d0dae8", overflow: "hidden", marginBottom: 10 }}>
      <button type="button" onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "11px 14px", background: "none", border: "none", cursor: "pointer",
        }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#5a3800", textTransform: "uppercase", letterSpacing: 1.3, ...M }}>{title}</span>
        <span style={{ color: "#b5a880", fontSize: 13 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ padding: "4px 14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {hint && <div style={{ fontSize: 10.5, color: "#6b4c10" }}>{hint}</div>}
          {children}
        </div>
      )}
    </div>
  );
}

function Row({ children }) {
  return <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{children}</div>;
}

// ─── SSN field (masked, role-gated reveal) ──────────────────────────────────

function SSNField({ role, referralId, value, onChange }) {
  const [revealed, setRevealed] = useState(null);
  const [busy, setBusy] = useState(false);
  const canUnmask = canUnmaskSSN(role);

  async function reveal() {
    setBusy(true);
    const { ssn, error } = await revealSSN(referralId);
    setBusy(false);
    if (error) { alert("Unable to reveal SSN (access denied or not on file)."); return; }
    setRevealed(ssn ?? "(none on file)");
  }

  return (
    <Field label="SSN (encrypted · access logged)">
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {revealed != null ? (
          <input value={revealed} readOnly style={{ ...inputStyle, ...M }} />
        ) : (
          <input value={value ?? ""} onChange={e => onChange(e.target.value)}
            placeholder={referralId ? "•••-••-••••" : "Enter SSN"} style={{ ...inputStyle, ...M }} />
        )}
        {referralId && canUnmask && revealed == null && (
          <button type="button" onClick={reveal} disabled={busy}
            style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #C9921A", background: "#fff", color: "#C9921A", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", ...M }}>
            {busy ? "…" : "Reveal"}
          </button>
        )}
      </div>
      {!canUnmask && (
        <span style={{ fontSize: 9.5, color: "#6b4c10", marginTop: 4, display: "block" }}>
          Your role can store but not unmask a full SSN.
        </span>
      )}
    </Field>
  );
}

// ─── Referral list ──────────────────────────────────────────────────────────

function ReferralList({ items, onSelect, onNew }) {
  return (
    <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      <button type="button" onClick={onNew}
        style={{ padding: "10px", borderRadius: 8, border: "none", background: "#D4A520", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", letterSpacing: 0.5, ...M }}>
        + New Referral
      </button>
      {items.length === 0 && (
        <div style={{ padding: 16, fontSize: 12, color: "#6b4c10", textAlign: "center" }}>
          No referrals yet. Capture one with a single detail.
        </div>
      )}
      {items.map(r => {
        const age = daysInStage(r.stage_entered_at);
        return (
          <button key={r.id} type="button" onClick={() => onSelect(r)}
            style={{
              textAlign: "left", padding: "10px 12px", borderRadius: 8, cursor: "pointer",
              background: "#141d2c", border: "none",
              borderLeft: `3px solid ${r.priority === "crisis" ? "#f87171" : r.priority === "high" ? "#fb923c" : "#D4A520"}`,
            }}>
            <div style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 700 }}>
              {r.display_label || buildDisplayLabel(r)}
            </div>
            <div style={{ color: "#93a6c4", fontSize: 10, marginTop: 3, ...M }}>
              {labelFor("stage", r.stage)}{r.city ? ` · ${r.city}` : ""}{age != null ? ` · ${age}d in stage` : ""}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── The sectioned capture / edit form ───────────────────────────────────────

function ReferralForm({ role, companyId, existing, onSaved }) {
  const [draft, setDraft] = useState(emptyDraft);
  const [open, setOpen] = useState({ meta: true, identity: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setDraft({ ...emptyDraft(), ...existing, ...(existing.details ?? {}), ssn: "", contactsDraft: [] });
    } else {
      setDraft(emptyDraft());
    }
  }, [existing]);

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const setNested = (group, k, v) => setDraft(d => ({ ...d, [group]: { ...d[group], [k]: v } }));
  const toggleArr = (k, v) => setDraft(d => {
    const cur = d[k] ?? [];
    return { ...d, [k]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] };
  });
  const toggleOpen = s => setOpen(o => ({ ...o, [s]: !o[s] }));

  const label = useMemo(() => buildDisplayLabel(draft), [draft]);
  const warnings = useMemo(() => softWarnings(draft), [draft]);
  const saveable = isSaveable(draft);

  async function save() {
    if (!saveable) return;
    setSaving(true);
    const payload = buildPayload(draft);
    let result;
    if (existing) result = await updateReferral(existing.id, payload);
    else result = await createReferral(companyId, payload);

    if (result.error || !result.data) {
      setSaving(false);
      alert("Save failed: " + (result.error?.message ?? "unknown error"));
      return;
    }
    const referralId = result.data.id;
    if (draft.ssn && draft.ssn.trim()) await setSSN(referralId, draft.ssn);
    for (const c of draft.contactsDraft) {
      if (isSaveable(c)) await addContact(referralId, c);
    }
    setSaving(false);
    onSaved(referralId);
  }

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* live label preview + save bar */}
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: "#141d2c", borderRadius: 11, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 8.5, color: "#93a6c4", textTransform: "uppercase", letterSpacing: 1.5, ...M }}>Display label</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        </div>
        <button type="button" onClick={save} disabled={!saveable || saving}
          style={{ padding: "10px 18px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", ...M, cursor: saveable && !saving ? "pointer" : "not-allowed", background: saveable ? "#00e5aa" : "#33404f", color: saveable ? "#06281f" : "#7a8aa3" }}>
          {saving ? "Saving…" : existing ? "Save changes" : "Save referral"}
        </button>
      </div>

      {warnings.length > 0 && (
        <div style={{ background: "#fff7e6", border: "1px solid #f0d28a", borderRadius: 9, padding: "9px 12px", marginBottom: 12, fontSize: 11, color: "#8a6010" }}>
          {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
          <div style={{ fontSize: 10, color: "#b59030", marginTop: 3 }}>These are reminders only — you can still save.</div>
        </div>
      )}

      <Section title="1 · Referral metadata" open={open.meta} onToggle={() => toggleOpen("meta")}>
        <Row>
          <Text label="Date received" type="date" value={draft.date_received} onChange={v => set("date_received", v)} />
          <Select label="Intake method" value={draft.intake_method} onChange={v => set("intake_method", v)} options={INTAKE_METHODS} />
          <Select label="Source type" value={draft.source_type} onChange={v => set("source_type", v)} options={SOURCE_TYPES} />
        </Row>
        <Row>
          <Select label="Priority" value={draft.priority} onChange={v => set("priority", v)} options={PRIORITIES} blank="Normal" />
          <Select label="Pipeline stage" value={draft.stage} onChange={v => set("stage", v)} options={ALL_STAGES} blank="New / Inquiry" />
        </Row>
        <div style={{ borderTop: "1px dashed #d5c898", paddingTop: 10 }}>
          <div style={{ ...labelStyle, color: "#5a3800" }}>Referring party (can be the whole record)</div>
          <Row>
            <Text label="Name" value={draft.referring_party.name} onChange={v => setNested("referring_party", "name", v)} />
            <Text label="Organization" value={draft.referring_party.organization} onChange={v => setNested("referring_party", "organization", v)} />
            <Text label="Role" value={draft.referring_party.role} onChange={v => setNested("referring_party", "role", v)} />
          </Row>
          <Row>
            <Text label="Phone" value={draft.referring_party.phone} onChange={v => setNested("referring_party", "phone", v)} />
            <Text label="Email" value={draft.referring_party.email} onChange={v => setNested("referring_party", "email", v)} />
          </Row>
        </div>
      </Section>

      <Section title="2 · Participant identity" open={open.identity} onToggle={() => toggleOpen("identity")}>
        <Row>
          <Text label="First name" value={draft.first_name} onChange={v => set("first_name", v)} />
          <Text label="Last name" value={draft.last_name} onChange={v => set("last_name", v)} />
          <Text label="Preferred name" value={draft.preferred_name} onChange={v => set("preferred_name", v)} />
        </Row>
        <Row>
          <Text label="Date of birth" type="date" value={draft.dob} onChange={v => set("dob", v)} />
          <TriToggle label="Minor?" value={draft.is_minor} onChange={v => set("is_minor", v)} />
          <Text label="Gender / pronouns" value={draft.pronouns} onChange={v => set("pronouns", v)} />
        </Row>
        <Row>
          <SSNField role={role} referralId={existing?.id} value={draft.ssn} onChange={v => set("ssn", v)} />
          <Text label="Medicaid / MMIS ID" value={draft.medicaid_id} onChange={v => set("medicaid_id", v)} />
          <Text label="Other ID numbers" value={draft.other_ids} onChange={v => set("other_ids", v)} />
        </Row>
      </Section>

      <Section title="3 · Location" open={open.location} onToggle={() => toggleOpen("location")}>
        <Row>
          <Text label="City" value={draft.city} onChange={v => set("city", v)} />
          <Text label="County" value={draft.county} onChange={v => set("county", v)} />
          <Text label="Region" value={draft.region} onChange={v => set("region", v)} />
          <Text label="State" value={draft.state} onChange={v => set("state", v)} />
        </Row>
        <Text label="Current address" value={draft.address} onChange={v => set("address", v)} />
        <Select label="Current living situation" value={draft.living_situation} onChange={v => set("living_situation", v)} options={LIVING_SITUATIONS} />
      </Section>

      <Section title="4 · Service & funding" open={open.service} onToggle={() => toggleOpen("service")}>
        <div>
          <span style={labelStyle}>Services requested</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SERVICES.map(s => (
              <Chip key={s.value} active={draft.services.includes(s.value)} onClick={() => toggleArr("services", s.value)}>{s.label}</Chip>
            ))}
          </div>
        </div>
        <Row>
          <Text label="Service level / acuity" value={draft.service_level} onChange={v => set("service_level", v)}
            suggestions={SERVICE_LEVELS.map(o => o.label)} placeholder="Traditional, Blended, Intense…" />
          <Select label="Pay source" value={draft.pay_source} onChange={v => set("pay_source", v)} options={PAY_SOURCES} />
          <Text label="Waiver / program" value={draft.waiver} onChange={v => set("waiver", v)} />
        </Row>
        <Row>
          <Text label="Authorized units / budget" value={draft.authorized_units} onChange={v => set("authorized_units", v)} />
          <Text label="Target start date" type="date" value={draft.target_start_date} onChange={v => set("target_start_date", v)} />
        </Row>
        <div style={{ borderTop: "1px dashed #d5c898", paddingTop: 10 }}>
          <div style={{ ...labelStyle, color: "#5a3800" }}>TSC / Plan developer</div>
          <Row>
            <Text label="Name" value={draft.tsc.name} onChange={v => setNested("tsc", "name", v)} />
            <Text label="Agency" value={draft.tsc.agency} onChange={v => setNested("tsc", "agency", v)} />
            <Text label="Phone" value={draft.tsc.phone} onChange={v => setNested("tsc", "phone", v)} />
            <Text label="Email" value={draft.tsc.email} onChange={v => setNested("tsc", "email", v)} />
          </Row>
        </div>
      </Section>

      <Section title="5 · Clinical & behavioral" hint="Risk indicators drive placement & staffing — kept scannable." open={open.clinical} onToggle={() => toggleOpen("clinical")}>
        <Area label="Primary diagnosis / diagnoses" value={draft.diagnoses} onChange={v => set("diagnoses", v)} />
        <div>
          <span style={labelStyle}>Risk indicators</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {RISK_INDICATORS.map(ri => (
              <Chip key={ri.value} danger active={draft.risk_indicators.includes(ri.value)} onClick={() => toggleArr("risk_indicators", ri.value)}>{ri.label}</Chip>
            ))}
          </div>
        </div>
        <Area label="Behavioral / behavior support needs" value={draft.behavior_notes} onChange={v => set("behavior_notes", v)} />
        <Row>
          <Text label="Medical / nursing needs" value={draft.medical_needs} onChange={v => set("medical_needs", v)} />
          <Text label="Mobility & ADL needs" value={draft.mobility_adl} onChange={v => set("mobility_adl", v)} />
          <Text label="Communication needs" value={draft.communication_needs} onChange={v => set("communication_needs", v)} />
        </Row>
        <RepeatableMedications medications={draft.medications} onChange={list => set("medications", list)} />
      </Section>

      <Section title="6 · Guardianship & contacts" open={open.guardian} onToggle={() => toggleOpen("guardian")}>
        <Row>
          <TriToggle label="Self-guardian? (if adult)" value={draft.self_guardian} onChange={v => set("self_guardian", v)} />
        </Row>
        <RepeatableContacts contacts={draft.contactsDraft} onChange={list => set("contactsDraft", list)} />
      </Section>

      <Section title="7 · Placement / housing" open={open.placement} onToggle={() => toggleOpen("placement")}>
        <Row>
          <TriToggle label="Housing needed?" value={draft.housing_needed} onChange={v => set("housing_needed", v)} />
          <Text label="Preferred location / proximity" value={draft.preferred_location} onChange={v => set("preferred_location", v)} />
        </Row>
        <Text label="Potential home match" value={draft.potential_home_match} onChange={v => set("potential_home_match", v)} />
        <Area label="Roommate compatibility notes" value={draft.roommate_notes} onChange={v => set("roommate_notes", v)} />
      </Section>

      <Section title="8 · Follow-up" open={open.followup} onToggle={() => toggleOpen("followup")}>
        <Row>
          <Text label="Next follow-up date" type="date" value={draft.next_followup_date} onChange={v => set("next_followup_date", v)} />
        </Row>
        {existing && <ActivityLog referral={existing} />}
        {!existing && <div style={{ fontSize: 10.5, color: "#6b4c10" }}>Activity log & status history appear once the referral is saved.</div>}
      </Section>

      <Section title="10 · Outcome / conversion" open={open.outcome} onToggle={() => toggleOpen("outcome")}>
        <Row>
          <Select label="Outcome" value={draft.outcome} onChange={v => set("outcome", v)} options={OUTCOMES} />
          <Text label="Decision date" type="date" value={draft.decision_date} onChange={v => set("decision_date", v)} />
        </Row>
        <Area label="Outcome reason" value={draft.outcome_reason} onChange={v => set("outcome_reason", v)} />
        <Text label="Client record link (placeholder)" value={draft.client_record_link} onChange={v => set("client_record_link", v)} />
      </Section>
    </div>
  );
}

function Chip({ active, danger, onClick, children }) {
  const activeBg = danger ? "#f87171" : "#D4A520";
  return (
    <button type="button" onClick={onClick}
      style={{
        padding: "5px 11px", borderRadius: 20, fontSize: 11, cursor: "pointer", ...M,
        border: `1px solid ${active ? activeBg : "#d5c898"}`,
        background: active ? activeBg : "#fff",
        color: active ? "#fff" : "#7a6030", fontWeight: 600,
      }}>{children}</button>
  );
}

function RepeatableContacts({ contacts, onChange }) {
  const add = () => onChange([...contacts, { kind: "family", name: "", relationship: "", phone: "", email: "", is_primary: false, ok_to_share: false }]);
  const upd = (i, k, v) => onChange(contacts.map((c, j) => j === i ? { ...c, [k]: v } : c));
  const rm = i => onChange(contacts.filter((_, j) => j !== i));
  return (
    <div style={{ borderTop: "1px dashed #d5c898", paddingTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ ...labelStyle, color: "#5a3800", marginBottom: 0 }}>Family / emergency contacts</span>
        <button type="button" onClick={add} style={{ fontSize: 11, color: "#C9921A", background: "none", border: "none", cursor: "pointer", fontWeight: 700, ...M }}>+ Add</button>
      </div>
      {contacts.map((c, i) => (
        <div key={i} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e3dcc6", padding: 10, marginTop: 8 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {REPEATABLE_CONTACT_KINDS.map(k => (
              <Chip key={k.value} active={c.kind === k.value} onClick={() => upd(i, "kind", k.value)}>{k.label}</Chip>
            ))}
          </div>
          <Row>
            <Text label="Name" value={c.name} onChange={v => upd(i, "name", v)} />
            <Text label="Relationship" value={c.relationship} onChange={v => upd(i, "relationship", v)} />
          </Row>
          <Row>
            <Text label="Phone" value={c.phone} onChange={v => upd(i, "phone", v)} />
            <Text label="Email" value={c.email} onChange={v => upd(i, "email", v)} />
          </Row>
          <div style={{ display: "flex", gap: 14, marginTop: 8, alignItems: "center" }}>
            <CheckRow label="Primary contact" checked={c.is_primary} onChange={v => upd(i, "is_primary", v)} />
            <CheckRow label="OK to share info" checked={c.ok_to_share} onChange={v => upd(i, "ok_to_share", v)} />
            <button type="button" onClick={() => rm(i)} style={{ marginLeft: "auto", fontSize: 11, color: "#b04040", background: "none", border: "none", cursor: "pointer", ...M }}>Remove</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RepeatableMedications({ medications, onChange }) {
  const list = Array.isArray(medications) ? medications : [];
  const add = () => onChange([...list, { name: "", dosage: "", frequency: "", purpose: "" }]);
  const upd = (i, k, v) => onChange(list.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  const rm = i => onChange(list.filter((_, j) => j !== i));
  return (
    <div style={{ borderTop: "1px dashed #d5c898", paddingTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ ...labelStyle, color: "#5a3800", marginBottom: 0 }}>Medications</span>
        <button type="button" onClick={add} style={{ fontSize: 11, color: "#C9921A", background: "none", border: "none", cursor: "pointer", fontWeight: 700, ...M }}>+ Add Medication</button>
      </div>
      {list.length === 0 && <div style={{ fontSize: 10.5, color: "#6b4c10", marginTop: 6 }}>No medications added.</div>}
      {list.map((m, i) => (
        <div key={i} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e3dcc6", padding: 10, marginTop: 8 }}>
          <Row>
            <Text label="Medication" value={m.name} onChange={v => upd(i, "name", v)} suggestions={COMMON_MEDICATIONS} placeholder="Start typing a name…" />
            <Text label="Dosage" value={m.dosage} onChange={v => upd(i, "dosage", v)} placeholder="e.g. 10 mg" />
          </Row>
          <Row>
            <Text label="Frequency" value={m.frequency} onChange={v => upd(i, "frequency", v)} suggestions={MEDICATION_FREQUENCIES} placeholder="e.g. Twice daily (BID)" />
            <Text label="Purpose" value={m.purpose} onChange={v => upd(i, "purpose", v)} placeholder="e.g. mood stabilization" />
          </Row>
          <div style={{ display: "flex", marginTop: 8 }}>
            <button type="button" onClick={() => rm(i)} style={{ marginLeft: "auto", fontSize: 11, color: "#b04040", background: "none", border: "none", cursor: "pointer", ...M }}>Remove</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function CheckRow({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6a5a30", cursor: "pointer" }}>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function ActivityLog({ referral }) {
  const items = referral.activity ?? [];
  return (
    <div>
      <span style={labelStyle}>Activity log</span>
      {items.length === 0 && <div style={{ fontSize: 11, color: "#6b4c10" }}>No activity yet.</div>}
      {items.map(a => (
        <div key={a.id} style={{ fontSize: 11, color: "#5a4a20", padding: "5px 0", borderBottom: "1px solid #ece4cf" }}>
          <span style={{ color: "#6b4c10", ...M }}>{new Date(a.created_at).toLocaleString()}</span> — {a.body}
        </div>
      ))}
    </div>
  );
}

// ─── Page container ───────────────────────────────────────────────────────────

export default function ReferralTracker({ userRole, onSignOut, onSwitchModule }) {
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [selected, setSelected] = useState(null);   // existing referral or null
  const [mode, setMode] = useState("idle");          // idle | edit (form shown)

  useEffect(() => {
    loadConfig().then(cfg => {
      const cos = (cfg?.companies ?? []).filter(c => !c.archived);
      setCompanies(cos);
      setCompanyId(cfg?.selectedCompanyId ?? cos[0]?.id ?? null);
    });
  }, []);

  async function refresh(id = companyId) {
    if (!id) return;
    setReferrals(await listReferrals(id));
  }
  useEffect(() => { refresh(companyId); }, [companyId]);

  function openNew() { setSelected(null); setMode("edit"); }
  async function openExisting(r) {
    const full = await getReferral(r.id);
    setSelected(full ?? r);
    setMode("edit");
  }
  async function handleSaved() {
    setMode("idle"); setSelected(null);
    await refresh();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f7fa", padding: "20px 24px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 18, color: "#D4A520", letterSpacing: 2 }}>Referral & Intake Tracker</div>
          <select value={companyId ?? ""} onChange={e => setCompanyId(e.target.value)}
            style={{ ...inputStyle, width: "auto", padding: "6px 10px" }}>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {onSwitchModule && (
            <button type="button" onClick={onSwitchModule}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d0dae8", background: "#fff", color: "#5a3800", fontSize: 12, fontWeight: 700, cursor: "pointer", ...M }}>
              ← Financial Tool
            </button>
          )}
          {onSignOut && (
            <button type="button" onClick={onSignOut}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d0dae8", background: "#fff", color: "#8a6010", fontSize: 12, cursor: "pointer", ...M }}>
              Sign out
            </button>
          )}
        </div>
      </header>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <ReferralList items={referrals} onSelect={openExisting} onNew={openNew} />
        {mode === "edit" && companyId ? (
          <ReferralForm key={selected?.id ?? "new"} role={userRole} companyId={companyId} existing={selected} onSaved={handleSaved} />
        ) : (
          <div style={{ flex: 1, padding: 40, textAlign: "center", color: "#6b4c10", fontSize: 13, background: "#f8f6f0", borderRadius: 11, border: "1px solid #d0dae8" }}>
            Select a referral or capture a new one. A single detail is enough to save.
          </div>
        )}
      </div>
    </div>
  );
}
