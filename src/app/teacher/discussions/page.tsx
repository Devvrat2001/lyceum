import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function TeacherDiscussionsPage() {
  return (
    <TeacherChrome active="community">
      <ComingSoon
        eyebrow="Discussions"
        title="Run discussions across your courses"
        description="Moderate per-lesson discussion threads, post announcements, and pin great student questions for the whole class. Mirrors the student-side community surface."
        icon="chat"
        phase="Phase 5"
        bullets={[
          "Per-lesson and per-class discussion threads",
          "Pin great questions for everyone to see",
          "AI moderation queue with FERPA-safe audit log",
          "Course-wide announcements + read receipts",
        ]}
        backHref="/teacher/analytics"
        backLabel="Back to analytics"
      />
    </TeacherChrome>
  );
}
