"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Btn, Icon } from "@/components/wf/primitives";

export function QuickLoginButton({
  email,
  label,
  next,
}: {
  email: string;
  label: string;
  next: string;
}) {
  const [pending, setPending] = useState(false);

  return (
    <Btn
      variant="ghost"
      sm
      full
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await signIn("credentials", { email, callbackUrl: next });
        // signIn redirects on success — we won't usually reach here.
      }}
      style={{
        justifyContent: "space-between",
        background: "white",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Icon name="user" size={12} />
        <span style={{ fontSize: 12 }}>{label}</span>
      </span>
      <span
        className="wf-mono"
        style={{
          fontSize: 10,
          color: "var(--wf-mute)",
          marginLeft: "auto",
        }}
      >
        {pending ? "…" : email}
      </span>
    </Btn>
  );
}
