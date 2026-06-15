import { ParentalConsentClient } from "@/components/auth/PasswordResetForms";

export const metadata = { title: "Parental consent · Lyceum" };

export default async function ParentalConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const sp = await searchParams;
  return (
    <ParentalConsentClient token={sp.token ?? ""} email={sp.email ?? ""} />
  );
}
