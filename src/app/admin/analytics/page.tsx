import { AdminChrome } from "@/components/layouts/AdminChrome";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function AdminAnalyticsPage() {
  return (
    <AdminChrome active="analytics">
      <ComingSoon
        eyebrow="District analytics"
        title="Cross-grade trends, custom reports, board exports"
        description="The overview dashboard's KPIs and heatmap are real today; this section adds the deep-dive: cohort comparisons across years, custom report builder with PDF export, and scheduled email digests for the board."
        icon="chart"
        phase="Phase 4"
        bullets={[
          "Year-over-year cohort trends with significance testing",
          "Custom report builder with shareable URLs",
          "Scheduled email digests (weekly/monthly/quarterly)",
          "Board-ready PDF exports with school branding",
          "Drill-in from heatmap cells to individual class rosters",
        ]}
        backHref="/admin"
        backLabel="Back to overview"
      />
    </AdminChrome>
  );
}
