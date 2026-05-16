import { AdminChrome } from "@/components/layouts/AdminChrome";
import { Card, Eyebrow, Icon } from "@/components/wf/primitives";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export default async function AdminBillingPage() {
  const session = await auth();
  const me = await db.user.findUnique({
    where: { id: session!.user.id },
    select: { institutionId: true },
  });
  const institutionId =
    me?.institutionId ??
    (await db.institution.findFirst({ select: { id: true } }))?.id;
  const inst = institutionId
    ? await db.institution.findUnique({ where: { id: institutionId } })
    : null;

  const activeUsers = institutionId
    ? await db.user.count({
        where: { institutionId, role: "STUDENT" },
      })
    : 0;

  return (
    <AdminChrome active="billing">
      <header
        style={{
          height: 56,
          padding: "0 24px",
          borderBottom: "1px solid var(--wf-hairline)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600 }}>Billing</span>
        <div style={{ flex: 1 }} />
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "20px 28px 40px",
          maxWidth: 1200,
        }}
      >
        <Eyebrow>Plan</Eyebrow>
        <Card p={20} style={{ marginTop: 8, marginBottom: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                className="wf-mono"
                style={{
                  fontSize: 10,
                  color: "var(--wf-mute)",
                  letterSpacing: "0.06em",
                }}
              >
                CURRENT
              </div>
              <div
                className="wf-serif"
                style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}
              >
                {inst?.plan ?? "FREE"}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--wf-body)",
                  marginTop: 4,
                }}
              >
                {inst?.seats ?? 0} seats · {activeUsers} active students
              </div>
            </div>
            <div
              style={{
                textAlign: "right",
              }}
            >
              <div
                className="wf-mono"
                style={{
                  fontSize: 10,
                  color: "var(--wf-mute)",
                  letterSpacing: "0.06em",
                }}
              >
                NEXT INVOICE
              </div>
              <div
                className="wf-serif"
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  marginTop: 4,
                  color: "var(--wf-mute)",
                }}
              >
                —
              </div>
              <div style={{ fontSize: 11, color: "var(--wf-mute)" }}>
                Stripe billing lands in Phase 3
              </div>
            </div>
          </div>
        </Card>

        <Eyebrow style={{ marginTop: 4, marginBottom: 8 }}>
          Invoices
        </Eyebrow>
        <Card p={20} style={{ marginBottom: 18 }}>
          <div
            style={{
              padding: 24,
              textAlign: "center",
              fontSize: 13,
              color: "var(--wf-mute)",
            }}
          >
            <Icon
              name="download"
              size={20}
              color="var(--wf-mute)"
              style={{ marginBottom: 6 }}
            />
            <div>No invoices yet — your school is on the free trial.</div>
          </div>
        </Card>
      </div>
    </AdminChrome>
  );
}
