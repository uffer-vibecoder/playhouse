import FarmBoard from "@/games/farm/FarmBoard";
import { pageTitle } from "@/lib/site";

/**
 * An early look at the night half of Smallholding.
 *
 * Not on the contents page on purpose: it is a prototype, and the index is a
 * promise about finished things. It exists to answer one question — is
 * watching a computed night worth doing — before the day, the money and the
 * crops get built on top of it.
 */
export const metadata = { title: pageTitle("Smallholding") };

export default function FarmPage() {
  return (
    <main className="shell">
      <FarmBoard />
    </main>
  );
}
