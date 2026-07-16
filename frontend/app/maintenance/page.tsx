import { redirect } from "next/navigation";

export default function MaintenanceRedirect() {
  redirect("/operations?section=maintenance&tab=unitoutage");
}
