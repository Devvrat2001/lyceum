"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Btn } from "@/components/wf/primitives";
import { trpc } from "@/lib/trpc/react";

export function FollowButton({ teacherId }: { teacherId: string }) {
  const { status } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const stateQ = trpc.teacher.followState.useQuery(
    { teacherId },
    { enabled: status === "authenticated" }
  );

  const toggle = trpc.teacher.toggleFollow.useMutation({
    onMutate: async () => {
      await utils.teacher.followState.cancel({ teacherId });
      const prev = utils.teacher.followState.getData({ teacherId });
      utils.teacher.followState.setData(
        { teacherId },
        { following: !prev?.following }
      );
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev)
        utils.teacher.followState.setData({ teacherId }, ctx.prev);
    },
    onSettled: () => utils.teacher.followState.invalidate({ teacherId }),
  });

  const following = stateQ.data?.following ?? false;

  return (
    <Btn
      variant={following ? "ai" : "ghost"}
      sm
      style={{ marginTop: 10 }}
      disabled={toggle.isPending}
      onClick={() => {
        if (status !== "authenticated") {
          router.push("/login?next=/");
          return;
        }
        toggle.mutate({ teacherId });
      }}
    >
      {toggle.isPending
        ? "…"
        : following
        ? "Following"
        : "Follow"}
    </Btn>
  );
}
