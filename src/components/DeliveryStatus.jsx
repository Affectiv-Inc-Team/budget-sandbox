/**
 * Shows the latest email delivery outcome for one recipient:
 * a colour-coded status badge plus the exact send timestamp.
 */
const STATUS_STYLE = {
  sent:       { label: "Delivered to mail provider", color: "#4ade80", dot: "●" },
  pending:    { label: "Queued",                     color: "#fbbf24", dot: "◐" },
  dlq:        { label: "Failed",                     color: "#fca5a5", dot: "✕" },
  failed:     { label: "Failed",                     color: "#fca5a5", dot: "✕" },
  bounced:    { label: "Bounced",                    color: "#fca5a5", dot: "✕" },
  complained: { label: "Marked as spam",             color: "#fca5a5", dot: "!" },
  suppressed: { label: "Suppressed",                 color: "#fbbf24", dot: "⊘" },
};

export default function DeliveryStatus({ record, fallbackSentAt = null }) {
  if (!record && !fallbackSentAt) {
    return (
      <span style={{ color: "#64748b", fontSize: 12 }} title="No email has ever been sent to this address">
        Never sent
      </span>
    );
  }

  const status = record?.status ?? "sent";
  const meta = STATUS_STYLE[status] ?? { label: status, color: "#94a3b8", dot: "●" };
  const when = record?.sentAt ?? fallbackSentAt;
  const stamp = when ? new Date(when) : null;

  return (
    <span
      style={{ display: "inline-block", lineHeight: 1.35 }}
      title={record?.errorMessage ? `Error: ${record.errorMessage}` : meta.label}
    >
      <span style={{ color: meta.color, fontSize: 12, whiteSpace: "nowrap" }}>
        {meta.dot} {meta.label}
      </span>
      {stamp && (
        <span style={{ display: "block", color: "#64748b", fontSize: 11, whiteSpace: "nowrap" }}>
          {stamp.toLocaleString()}
          {record?.templateName ? ` · ${record.templateName}` : ""}
        </span>
      )}
      {record?.errorMessage && (
        <span style={{ display: "block", color: "#fca5a5", fontSize: 11 }}>
          {record.errorMessage}
        </span>
      )}
    </span>
  );
}
