import { useJournal } from "../../store/useJournal";
import { scrambleText } from "../../lib/mask";

/** Returns a text passthrough that scrambles while the journal is masked.
 * Numbers (durations, totals) stay readable - the what, not the how-long,
 * is the sensitive part. */
export function useMaskText(): (text: string) => string {
  const masked = useJournal((s) => s.masked);
  return masked ? scrambleText : (text) => text;
}
