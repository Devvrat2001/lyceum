import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import { TeacherDiscussionsClient } from "@/components/teacher/TeacherDiscussionsClient";

export default function TeacherDiscussionsPage() {
  return (
    <TeacherChrome active="community">
      <TeacherDiscussionsClient />
    </TeacherChrome>
  );
}
