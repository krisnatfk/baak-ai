import { redirect } from "next/navigation";

/**
 * Halaman akar — arahkan ke dashboard (proxy yang menjaga /login).
 */
export default function RootPage() {
  redirect("/dashboard");
}
