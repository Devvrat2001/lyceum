/**
 * Skill-tree progression (REQUIREMENTS R42 — closing a zero-coverage
 * router). Two layers:
 *  - `computeSkillStates` pure: the done/now/unlocked/locked rules +
 *    "current" selection, asserted exhaustively with no DB.
 *  - `skill.tree` router: seeds a 3-node A→B→C chain for one user and
 *    checks the wired states + user-scoped stats (level from XP, streak).
 *    The query is global, so assertions scope to the seeded slugs and to
 *    the fresh user's own mastery (no global totals).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { computeSkillStates } from "@/server/services/skillProgress";
import { cleanupTestUsers, createTestUser } from "./helpers";

describe("computeSkillStates (pure)", () => {
  // A → B → C : A is prereq of B, B is prereq of C.
  const skills = [{ id: "A" }, { id: "B" }, { id: "C" }];
  const edges = [
    { fromId: "A", toId: "B" },
    { fromId: "B", toId: "C" },
  ];

  it("a fresh learner starts at the root: root unlocked, rest locked", () => {
    const { stateOf, currentId } = computeSkillStates(
      skills,
      edges,
      new Map()
    );
    expect(stateOf("A")).toBe("unlocked");
    expect(stateOf("B")).toBe("locked");
    expect(stateOf("C")).toBe("locked");
    expect(currentId).toBe("A");
  });

  it("an in-progress middle node is 'now' and becomes current", () => {
    const m = new Map([
      ["A", 1],
      ["B", 0.3],
    ]);
    const { stateOf, currentId } = computeSkillStates(skills, edges, m);
    expect(stateOf("A")).toBe("done");
    expect(stateOf("B")).toBe("now");
    expect(stateOf("C")).toBe("locked"); // prereq B not done
    expect(currentId).toBe("B");
  });

  it("mastering a prereq unlocks the next node", () => {
    const m = new Map([
      ["A", 1],
      ["B", 0.9],
    ]);
    const { stateOf, currentId } = computeSkillStates(skills, edges, m);
    expect(stateOf("B")).toBe("done");
    expect(stateOf("C")).toBe("unlocked");
    expect(currentId).toBe("C"); // only candidate
  });
});

describe("skill.tree router", () => {
  let slugA: string;
  let slugB: string;
  let slugC: string;
  let idA: string;
  let idB: string;
  let idC: string;

  beforeAll(async () => {
    await cleanupTestUsers();
    const tag = crypto.randomUUID().slice(0, 8);
    slugA = `test-vitest-skill-a-${tag}`;
    slugB = `test-vitest-skill-b-${tag}`;
    slugC = `test-vitest-skill-c-${tag}`;
    const a = await db.skill.create({
      data: { slug: slugA, title: "Counting", col: 0, row: 0 },
    });
    const b = await db.skill.create({
      data: { slug: slugB, title: "Adding", col: 1, row: 0 },
    });
    const c = await db.skill.create({
      data: { slug: slugC, title: "Multiplying", col: 2, row: 0 },
    });
    idA = a.id;
    idB = b.id;
    idC = c.id;
    await db.skillEdge.create({ data: { fromId: a.id, toId: b.id } });
    await db.skillEdge.create({ data: { fromId: b.id, toId: c.id } });
  });

  afterAll(async () => {
    // Cascade removes the edges; mastery is cleaned with the test users.
    await db.skill.deleteMany({
      where: { slug: { in: [slugA, slugB, slugC] } },
    });
    await cleanupTestUsers();
  });

  it("wires node states + user-scoped stats for the seeded chain", async () => {
    const student = await createTestUser({ role: "STUDENT" });
    // A mastered, B in progress, C untouched.
    await db.mastery.create({
      data: { userId: student.id, skillId: idA, level: 1 },
    });
    await db.mastery.create({
      data: { userId: student.id, skillId: idB, level: 0.3 },
    });
    // Level = 1 + floor(xp/350); 700 → level 3. Streak drives the chip.
    await db.xPEvent.create({
      data: { userId: student.id, points: 700, source: "test_seed" },
    });
    await db.streak.create({
      data: { userId: student.id, current: 5, longest: 5 },
    });

    const tree = await student.caller.skill.tree({});
    const byId = new Map(tree.nodes.map((n) => [n.id, n]));
    expect(byId.get(idA)?.state).toBe("done");
    expect(byId.get(idB)?.state).toBe("now");
    expect(byId.get(idC)?.state).toBe("locked");
    // B (0.3) is the highest-progress non-done candidate → current.
    expect(byId.get(idB)?.current).toBe(true);
    expect(byId.get(idA)?.masteryPct).toBe(100);
    expect(byId.get(idB)?.masteryPct).toBe(30);

    expect(tree.stats.level).toBe(3);
    expect(tree.stats.streak).toBe(5);
  });
});
