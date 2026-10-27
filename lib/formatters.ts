/**
 * Formats a Stellar ledger sequence number with locale grouping.
 */
export function formatLedger(ledger: number | null | undefined): string {
  if (ledger === null || ledger === undefined || isNaN(ledger)) {
    return "—";
  }
  return new Intl.NumberFormat("en-US").format(ledger);
}

/**
 * Truncates a Stellar contract ID or account address for clean UI display.
 */
export function truncateAddress(
  address: string | null | undefined,
  visibleChars: number = 6,
): string {
  if (!address) return "—";
  if (address.length <= visibleChars * 2 + 3) return address;
  return `${address.slice(0, visibleChars)}...${address.slice(-visibleChars)}`;
}

/**
 * Formats an ISO 8601 timestamp string into a localized readable date-time.
 */
export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return "—";
  }
}
