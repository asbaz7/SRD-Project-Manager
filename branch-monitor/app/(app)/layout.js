import AppShell from "@/components/AppShell";
import { requireApprovedUser } from "@/lib/auth";

export default async function AppLayout({ children }) {
  const { profile } = await requireApprovedUser();
  return <AppShell profile={profile}>{children}</AppShell>;
}
