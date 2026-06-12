import { router, publicProcedure } from "../trpc";
import { marketplaceRouter } from "./marketplace";
import { courseRouter } from "./course";
import { studentRouter } from "./student";
import { lessonRouter } from "./lesson";
import { skillRouter } from "./skill";
import { teacherRouter } from "./teacher";
import { adminRouter } from "./admin";
import { notificationRouter } from "./notification";
import { authRouter } from "./auth";
import { pathRouter } from "./path";
import { generatorRouter } from "./generator";
import { insightRouter } from "./insight";
import { paymentRouter } from "./payment";
import { accountRouter } from "./account";
import { assignmentRouter } from "./assignment";
import { parentRouter } from "./parent";

export const appRouter = router({
  health: publicProcedure.query(() => ({
    ok: true as const,
    at: new Date().toISOString(),
  })),
  marketplace: marketplaceRouter,
  course: courseRouter,
  student: studentRouter,
  lesson: lessonRouter,
  skill: skillRouter,
  teacher: teacherRouter,
  admin: adminRouter,
  notification: notificationRouter,
  auth: authRouter,
  path: pathRouter,
  generator: generatorRouter,
  insight: insightRouter,
  payment: paymentRouter,
  account: accountRouter,
  assignment: assignmentRouter,
  parent: parentRouter,
});

export type AppRouter = typeof appRouter;
