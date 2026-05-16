import { StudentChrome } from "@/components/layouts/StudentChrome";
import { ComingSoon } from "@/components/ui/ComingSoon";

export default function StudentCommunityPage() {
  return (
    <StudentChrome active="community">
      <ComingSoon
        eyebrow="Community"
        title="Class discussions, study groups, peer help"
        description="A moderated space to ask classmates for help, share notes, and join study groups around a skill. Heavily moderated for K-12 with FERPA-safe defaults."
        icon="chat"
        phase="Phase 5"
        bullets={[
          "Per-lesson discussion threads (teacher-moderated)",
          "Peer-tutoring matchmaking with the AI tutor as fallback",
          "Anonymized study groups that opt in by skill",
          "Strict K-12 content filters + audit logs",
        ]}
        backHref="/student"
        backLabel="Back to dashboard"
      />
    </StudentChrome>
  );
}
