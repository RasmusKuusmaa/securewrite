import { useMask } from "../../store/useMask";
import { scrambleText } from "../../lib/mask";

/** Returns a text passthrough that scrambles while the app is masked.
 * Numbers (durations, totals) stay readable - the what, not the how-long,
 * is the sensitive part. */
export function useMaskText(): (text: string) => string {
  const masked = useMask((s) => s.masked);
  return masked ? scrambleText : (text) => text;
}
