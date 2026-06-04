import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { BoardReportData } from "@/server/services/boardReport";

/**
 * Board report — PDF rendering. Pure: takes a `BoardReportData` snapshot and
 * returns the PDF bytes via @react-pdf/renderer (no headless browser, runs in
 * the Node serverless runtime). The institution's brandColor accents the
 * header so the report carries through institution branding.
 */

const INK = "#1a1a1a";
const MUTE = "#8a8780";
const HAIRLINE = "#e5e3dd";

const styles = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 48,
    fontFamily: "Helvetica",
    color: INK,
    fontSize: 11,
  },
  header: { padding: "28 40", color: "#ffffff" },
  eyebrow: { fontSize: 9, letterSpacing: 1, textTransform: "uppercase", opacity: 0.8 },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", marginTop: 6 },
  headerMeta: { fontSize: 10, marginTop: 8, opacity: 0.9 },
  body: { padding: "24 40" },
  sectionLabel: {
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: MUTE,
    marginBottom: 10,
    marginTop: 20,
  },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: {
    width: "31%",
    border: `1 solid ${HAIRLINE}`,
    borderRadius: 6,
    padding: 12,
  },
  kpiLabel: { fontSize: 8, color: MUTE, textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValue: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 4 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottom: `1 solid ${HAIRLINE}`,
  },
  insight: { marginBottom: 12 },
  insightKind: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
    color: MUTE,
    marginBottom: 3,
  },
  insightBody: { fontSize: 11, lineHeight: 1.4 },
  empty: { fontSize: 10, color: MUTE },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 8,
    color: MUTE,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function BoardReportDoc({ data }: { data: BoardReportData }) {
  const accent = data.brandColor ?? INK;
  const dateLabel = data.generatedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <Document title={`Board Report — ${data.institutionName}`}>
      <Page size="A4" style={styles.page}>
        <View style={[styles.header, { backgroundColor: accent }]}>
          <Text style={styles.eyebrow}>Lyceum · Board Report</Text>
          <Text style={styles.title}>{data.institutionName}</Text>
          <Text style={styles.headerMeta}>Generated {dateLabel}</Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionLabel}>At a glance</Text>
          <View style={styles.kpiRow}>
            {data.kpis.map((k) => (
              <View key={k.label} style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{k.label}</Text>
                <Text style={styles.kpiValue}>{k.value}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Top teachers by reach</Text>
          {data.topTeachers.length > 0 ? (
            data.topTeachers.map((t, i) => (
              <View key={`${t.name}-${i}`} style={styles.row}>
                <Text>{t.name}</Text>
                <Text style={{ color: MUTE }}>
                  {t.classes} class{t.classes === 1 ? "" : "es"} · {t.students}{" "}
                  student{t.students === 1 ? "" : "s"}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>No teachers assigned yet.</Text>
          )}

          <Text style={styles.sectionLabel}>AI insights</Text>
          {data.insights.length > 0 ? (
            data.insights.map((ins, i) => (
              <View key={`${ins.kind}-${i}`} style={styles.insight}>
                <Text style={styles.insightKind}>{ins.kind}</Text>
                <Text style={styles.insightBody}>{ins.body}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>
              No insights generated yet — they appear after the nightly run or
              the first analytics visit.
            </Text>
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text>{data.institutionName}</Text>
          <Text>Confidential · Lyceum</Text>
        </View>
      </Page>
    </Document>
  );
}

/** Render a board report to PDF bytes. */
export async function renderBoardReportPdf(
  data: BoardReportData
): Promise<Buffer> {
  return renderToBuffer(<BoardReportDoc data={data} />);
}
