import { ResetPasswordForm } from "@/components/auth/PasswordResetForms";

export const metadata = { title: "Reset password · Lyceum" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const sp = await searchParams;
  return <ResetPasswordForm token={sp.token ?? ""} email={sp.email ?? ""} />;
}
