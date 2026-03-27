import { redirect } from "next/navigation";

export default function TournamentsRedirect() {
  redirect("/dashboard/tournaments");
}
