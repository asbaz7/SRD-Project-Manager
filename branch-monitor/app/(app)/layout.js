import AppShell from "@/components/AppShell";
import LiveSync from "@/components/LiveSync";
import { requireApprovedUser } from "@/lib/auth";

export default async function AppLayout({ children }) {
  const { profile } = await requireApprovedUser();
  return <AppShell profile={profile}><LiveSync />{children}</AppShell>;
}
