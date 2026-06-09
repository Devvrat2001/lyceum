import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import { PathsClient } from "@/components/teacher/PathsClient";

export const metadata = { title: "Bundles · Lyceum" };

/**
 * Teacher bundle manager — create/delete multi-course paths. proxy.ts
 * gates /teacher/*; data loads client-side via tRPC so this stays a
 * thin shell.
 */
export default function TeacherPathsPage() {
  return (
    <TeacherChrome active="paths">
      <PathsClient />
    </TeacherChrome>
  );
}
