import { redirect } from "next/navigation";

export default function ConstraintsRedirect() {
  redirect("/operations?section=constraints&tab=mustrun");
}
