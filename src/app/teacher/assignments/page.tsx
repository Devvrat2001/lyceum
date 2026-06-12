import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import { AssignmentsClient } from "@/components/teacher/AssignmentsClient";

export default function TeacherAssignmentsPage() {
  return (
    <TeacherChrome active="assignments">
      <AssignmentsClient />
    </TeacherChrome>
  );
}
