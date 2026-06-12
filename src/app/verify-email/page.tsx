import { VerifyEmailClient } from "@/components/auth/PasswordResetForms";

export const metadata = { title: "Verify email · Lyceum" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const sp = await searchParams;
  return <VerifyEmailClient token={sp.token ?? ""} email={sp.email ?? ""} />;
}
