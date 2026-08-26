/**
 * Skill Health Report Tool
 * Generates comprehensive health report combining audit, validation, and conflict data.
 */
import { detectConflicts } from "./conflict-detect.js";
import { runSkillAudit } from "./skill-audit.js";
import { runValidation } from "./skill-validate.js";
export async function generateHealthReport(options) {
    const audit = await runSkillAudit({ skillsDir: options.skillsDir });
    const validation = await runValidation({
        skillsDir: options.skillsDir,
        strictMode: options.strictMode,
    });
    const conflicts = detectConflicts({
        skills: audit.skills,
        similarityThreshold: options.similarityThreshold,
    });
    const totalTriggers = audit.skills.reduce((sum, s) => sum + s.triggers.length, 0);
    const uniqueTools = new Set(audit.skills.flatMap((s) => s.requiredTools));
    const criticalCount = conflicts.filter((c) => c.severity === "CRITICAL").length;
    const highCount = conflicts.filter((c) => c.severity === "HIGH").length;
    const mediumCount = conflicts.filter((c) => c.severity === "MEDIUM").length;
    const fixes = generateFixes(conflicts);
    return {
        summary: {
            totalSkills: audit.totalSkills,
            totalTriggers,
            uniqueTools: uniqueTools.size,
            criticalCount,
            highCount,
            mediumCount,
            healthy: criticalCount === 0 && highCount === 0 && validation.failed === 0,
        },
        skills: audit.skills,
        conflicts,
        fixes,
        generatedAt: new Date().toISOString(),
    };
}
function generateFixes(conflicts) {
    const fixes = [];
    const seen = new Set();
    for (const conflict of conflicts) {
        const key = `${conflict.type}:${conflict.skills.join(",")}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        switch (conflict.type) {
            case "EXACT_OVERLAP": {
                if (conflict.trigger) {
                    fixes.push({
                        type: "REFINE_TRIGGER",
                        target: conflict.skills.join(", "),
                        description: `Refine trigger "${conflict.trigger}" to be domain-specific`,
                        autoApplicable: false,
                        patch: generateTriggerRefinement(conflict.trigger, conflict.skills),
                    });
                }
                break;
            }
            case "SIMILAR_TRIGGER": {
                if (conflict.triggerA && conflict.triggerB) {
                    fixes.push({
                        type: "REFINE_TRIGGER",
                        target: conflict.skills.join(", "),
                        description: `Differentiate "${conflict.triggerA}" from "${conflict.triggerB}"`,
                        autoApplicable: false,
                    });
                }
                break;
            }
            case "DESCRIPTION_CLASH": {
                if (conflict.similarity && parseFloat(conflict.similarity) > 90) {
                    fixes.push({
                        type: "MERGE_SKILLS",
                        target: conflict.skills.join(", "),
                        description: `Consider merging ${conflict.skills.join(" and ")} (descriptions ${conflict.similarity} similar)`,
                        autoApplicable: false,
                    });
                }
                break;
            }
            case "TOOL_COMPETITION": {
                fixes.push({
                    type: "ADD_PRIORITY",
                    target: conflict.skills.join(", "),
                    description: `Add priority metadata to establish activation order`,
                    autoApplicable: true,
                    patch: generatePriorityPatch(conflict.skills),
                });
                break;
            }
            case "NAME_COLLISION": {
                fixes.push({
                    type: "RENAME_SKILL",
                    target: conflict.skills.join(", "),
                    description: `Rename skills to have unique names`,
                    autoApplicable: false,
                });
                break;
            }
        }
    }
    return fixes;
}
function generateTriggerRefinement(trigger, skills) {
    return skills
        .map((skill) => `  ${skill}: "${trigger} for ${skill.replace(/-/g, " ")}"`)
        .join("\n");
}
function generatePriorityPatch(skills) {
    return skills
        .map((skill, i) => `  ${skill}: metadata.openclaw.priority = "${i === 0 ? "highest" : "high"}"`)
        .join("\n");
}
//# sourceMappingURL=skill-health-report.js.map