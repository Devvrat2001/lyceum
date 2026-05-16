import { redirect } from "next/navigation";

export default function TeacherIndex() {
  redirect("/teacher/courses/algebra-foundations/edit");
}
