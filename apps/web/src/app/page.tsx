import { redirect } from "next/navigation";

/**
 * The console has no content at the root — Dashboard is a module like any
 * other, and giving it two URLs would make every "is this the active entry"
 * check special-case one of them.
 */
export default function RootPage() {
  redirect("/dashboard");
}
