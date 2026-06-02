import { AdminChrome } from "@/components/layouts/AdminChrome";
import { BrandingEditor } from "@/components/admin/BrandingEditor";

export const metadata = { title: "Branding · Lyceum" };

export default function AdminBrandingPage() {
  return (
    <AdminChrome active="branding">
      <BrandingEditor />
    </AdminChrome>
  );
}
