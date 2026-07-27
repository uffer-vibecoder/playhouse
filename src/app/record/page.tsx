import Record from "@/components/Record";
import { pageTitle } from "@/lib/site";

/**
 * The record — design 2c.
 *
 * Deliberately not gated behind sign-in: it reads the saves that already exist
 * on the device, and it hosts the theme panel. Gating it would put choosing a
 * look behind an account, which this site does not do.
 */
export const metadata = { title: pageTitle("The record") };

export default function RecordPage() {
  return <Record />;
}
