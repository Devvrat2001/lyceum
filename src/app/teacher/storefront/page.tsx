import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function TeacherStorefrontPage() {
  return (
    <TeacherChrome active="storefront">
      <ComingSoon
        eyebrow="Storefront"
        title="Your public teacher profile"
        description="Customize your storefront page that buyers see in the marketplace. Pick a brand color, write a bio, pin top courses, link to your blog, and set referral codes. Storefront editing ships with Stripe Connect in Phase 3 — until then, your name and course list show up automatically on the marketplace."
        icon="star"
        phase="Phase 3"
        bullets={[
          "Custom URL: lyceum.app/t/your-handle",
          "Brand color + cover photo upload",
          "Pin top courses + create bundles",
          "Embed testimonials and student outcomes",
          "Referral codes with revenue tracking",
        ]}
        backHref="/teacher"
        backLabel="Back to my courses"
      />
    </TeacherChrome>
  );
}
