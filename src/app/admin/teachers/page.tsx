import { AdminChrome } from "@/components/layouts/AdminChrome";
import { TeachersAdminClient } from "@/components/admin/TeachersAdminClient";

export const metadata = { title: "Teachers · Lyceum" };

export default function AdminTeachersPage() {
  return (
    <AdminChrome active="teachers">
      <TeachersAdminClient />
    </AdminChrome>
  );
}
