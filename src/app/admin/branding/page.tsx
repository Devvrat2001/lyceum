import { AdminChrome } from "@/components/layouts/AdminChrome";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function AdminBrandingPage() {
  return (
    <AdminChrome active="branding">
      <ComingSoon
        eyebrow="Branding"
        title="Make Lyceum yours"
        description="Upload your school crest, set your accent color, customize the login page, and add a vanity domain. Branding changes flow through every screen students see."
        icon="star"
        phase="Phase 4"
        bullets={[
          "School logo on the navbar + login screen",
          "Custom accent color (replaces the orange)",
          "Vanity domain (learn.yourschool.edu)",
          "Sign-in page background image + welcome copy",
          "Email template branding for parent reports",
        ]}
        backHref="/admin"
        backLabel="Back to overview"
      />
    </AdminChrome>
  );
}
