import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { StudentReportData } from "@/server/services/studentReport";

/**
 * Student progress report — PDF rendering. Pure: a `StudentReportData` snapshot
 * in, PDF bytes out via @react-pdf/renderer. Parent-friendly: big stat cards,
 * a this-week momentum strip, and a per-course progress list.
 */

const INK = "#1a1a1a";
const ACCENT = "#3b5bdb";
const MUTE = "#8a8780";
const HAIRLINE = "#e5e3dd";
const TRACK = "#eceae4";

const styles = StyleSheet.create({
  page: { paddingBottom: 48, fontFamily: "Helvetica", color: INK, fontSize: 11 },
  header: { padding: "28 40", backgroundColor: ACCENT, color: "#ffffff" },
  eyebrow: { fontSize: 9, letterSpacing: 1, textTransform: "uppercase", opacity: 0.85 },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", marginTop: 6 },
  headerMeta: { fontSize: 10, marginTop: 8, opacity: 0.9 },
  body: { padding: "24 40" },
  sectionLabel: {
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: MUTE,
    marginTop: 20,
    marginBottom: 10,
  },
  statRow: { flexDirection: "row", gap: 10 },
  statCard: {
    width: "23%",
    border: `1 solid ${HAIRLINE}`,
    borderRadius: 6,
    padding: 12,
  },
  statValue: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  statLabel: {
    fontSize: 8,
    color: MUTE,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  weekLine: { fontSize: 12, lineHeight: 1.5 },
  courseRow: { marginBottom: 10 },
  courseTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  courseTitle: { fontSize: 11 },
  coursePct: { fontSize: 10, color: MUTE },
  track: { height: 6, backgroundColor: TRACK, borderRadius: 3 },
  fill: { height: 6, backgroundColor: ACCENT, borderRadius: 3 },
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

function StudentReportDoc({ data }: { data: StudentReportData }) {
  const dateLabel = data.generatedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const stats = [
    { label: "Total XP", value: data.xp.toLocaleString() },
    { label: "Level", value: `L${data.level}` },
    { label: "Day streak", value: String(data.streak) },
    { label: "Badges", value: String(data.badges) },
  ];
  return (
    <Document title={`Progress Report — ${data.studentName}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Lyceum · Progress Report</Text>
          <Text style={styles.title}>{data.studentName}</Text>
          <Text style={styles.headerMeta}>Generated {dateLabel}</Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionLabel}>Lifetime</Text>
          <View style={styles.statRow}>
            {stats.map((s) => (
              <View key={s.label} style={styles.statCard}>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionLabel}>This week</Text>
          <Text style={styles.weekLine}>
            {data.lessonsThisWeek} lesson{data.lessonsThisWeek === 1 ? "" : "s"}{" "}
            completed · {data.xpThisWeek.toLocaleString()} XP earned ·{" "}
            {data.lessonsCompleted} lesson
            {data.lessonsCompleted === 1 ? "" : "s"} completed all-time
          </Text>

          <Text style={styles.sectionLabel}>Courses</Text>
          {data.courses.length > 0 ? (
            data.courses.map((c, i) => (
              <View key={`${c.title}-${i}`} style={styles.courseRow}>
                <View style={styles.courseTop}>
                  <Text style={styles.courseTitle}>{c.title}</Text>
                  <Text style={styles.coursePct}>
                    {c.completed ? "Completed" : `${c.progressPct}%`}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${Math.max(0, Math.min(100, c.progressPct))}%` },
                    ]}
                  />
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>No courses enrolled yet.</Text>
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text>{data.studentName}</Text>
          <Text>Lyceum</Text>
        </View>
      </Page>
    </Document>
  );
}

/** Render a student progress report to PDF bytes. */
export async function renderStudentReportPdf(
  data: StudentReportData
): Promise<Buffer> {
  return renderToBuffer(<StudentReportDoc data={data} />);
}
