import { TeacherChrome } from "@/components/layouts/TeacherChrome";
import { GradingClient } from "@/components/teacher/GradingClient";

export default function TeacherGradingPage() {
  return (
    <TeacherChrome active="grading">
      <GradingClient />
    </TeacherChrome>
  );
}
