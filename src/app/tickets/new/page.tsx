import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import NewTicketForm from "./NewTicketForm";

export default async function NewTicketPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <NewTicketForm />;
}
