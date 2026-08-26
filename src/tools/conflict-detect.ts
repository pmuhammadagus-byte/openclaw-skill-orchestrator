/**
 * Conflict Detection Tool
 * Detects trigger overlaps, description similarities, and tool competitions.
 */

import type { SkillRecord, Conflict } from "../utils/types.js";

export interface ConflictDetectOptions {
  skills: SkillRecord[];
  similarityThreshold: number;
}

export function detectConflicts(options: ConflictDetectOptions): Conflict[] {
  const { skills, similarityThreshold } = options;
  const conflicts: Conflict[] = [];

  // 1. Exact trigger overlap
  const triggerMap = new Map<string, string[]>();
  for (const skill of skills) {
    for (const trigger of skill.triggers) {
      const key = trigger.toLowerCase().trim();
      if (!triggerMap.has(key)) triggerMap.set(key, []);
      triggerMap.get(key)!.push(skill.name);
    }
  }

  for (const [trigger, skillNames] of triggerMap) {
    if (skillNames.length > 1) {
      conflicts.push({
        type: "EXACT_OVERLAP",
        severity: skillNames.length > 2 ? "CRITICAL" : "HIGH",
        skills: skillNames,
        trigger,
        message: `Trigger "${trigger}" is used by ${skillNames.length} skills`,
        fix: `Refine trigger "${trigger}" to be more specific in: ${skillNames.join(", ")}`,
      });
    }
  }

  // 2. Similar triggers
  const allTriggers: { skill: string; trigger: string }[] = [];
  for (const skill of skills) {
    for (const trigger of skill.triggers) {
      allTriggers.push({ skill: skill.name, trigger });
    }
  }

  for (let i = 0; i < allTriggers.length; i++) {
    for (let j = i + 1; j < allTriggers.length; j++) {
      const a = allTriggers[i];
      const b = allTriggers[j];
      if (a.skill === b.skill) continue;

      const sim = similarity(a.trigger, b.trigger);
      if (sim >= similarityThreshold) {
        conflicts.push({
          type: "SIMILAR_TRIGGER",
          severity: sim > 0.8 ? "HIGH" : "MEDIUM",
          skills: [a.skill, b.skill],
          triggerA: a.trigger,
          triggerB: b.trigger,
          similarity: `${(sim * 100).toFixed(1)}%`,
          message: `Triggers "${a.trigger}" and "${b.trigger}" are ${(sim * 100).toFixed(1)}% similar`,
          fix: `Differentiate triggers: "${a.trigger}" vs "${b.trigger}"`,
        });
      }
    }
  }

  // 3. Description clashes
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const a = skills[i];
      const b = skills[j];
      const sim = similarity(a.description, b.description);
      if (sim >= 0.7) {
        conflicts.push({
          type: "DESCRIPTION_CLASH",
          severity: sim > 0.9 ? "HIGH" : "MEDIUM",
          skills: [a.name, b.name],
          similarity: `${(sim * 100).toFixed(1)}%`,
          message: `Descriptions are ${(sim * 100).toFixed(1)}% similar`,
          fix: sim > 0.9 ? `Consider merging ${a.name} and ${b.name}` : `Differentiate descriptions`,
        });
      }
    }
  }

  // 4. Tool competition
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const a = skills[i];
      const b = skills[j];
      const sharedTools = a.requiredTools.filter((t) => b.requiredTools.includes(t));
      if (sharedTools.length >= 2) {
        // Check trigger similarity
        let maxTrigSim = 0;
        for (const ta of a.triggers) {
          for (const tb of b.triggers) {
            maxTrigSim = Math.max(maxTrigSim, similarity(ta, tb));
          }
        }
        if (maxTrigSim > 0.5) {
          conflicts.push({
            type: "TOOL_COMPETITION",
            severity: "HIGH",
            skills: [a.name, b.name],
            sharedTools,
            similarity: `${(maxTrigSim * 100).toFixed(1)}%`,
            message: `${a.name} and ${b.name} share ${sharedTools.length} tools with ${(maxTrigSim * 100).toFixed(1)}% trigger similarity`,
            fix: `Assign priority metadata or merge skills`,
          });
        }
      }
    }
  }

  // 5. Name collisions
  const nameMap = new Map<string, string[]>();
  for (const skill of skills) {
    if (!nameMap.has(skill.name)) nameMap.set(skill.name, []);
    nameMap.get(skill.name)!.push(skill.filepath);
  }
  for (const [name, paths] of nameMap) {
    if (paths.length > 1) {
      conflicts.push({
        type: "NAME_COLLISION",
        severity: "CRITICAL",
        skills: paths.map((p) => `${name} (${p})`),
        message: `Skill name "${name}" is used by ${paths.length} different files`,
        fix: `Rename skills to have unique names`,
      });
    }
  }

  return conflicts;
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const aWords = a.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const bWords = b.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (aWords.length === 0 || bWords.length === 0) return 0;

  const intersection = aWords.filter((w) => bWords.includes(w));
  return intersection.length / Math.max(aWords.length, bWords.length);
}
