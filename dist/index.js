/**
 * Skill Orchestrator — Clara Edition
 *
 * Discovers, validates, audits, and resolves conflicts across all workspace
 * skills. Built for operators running many custom skills. Rewritten to the
 * modern OpenClaw plugin SDK while keeping the full business logic from the
 * original tool modules.
 *
 * Tools:
 *   skill_audit            — full inventory + validation + dependency scan
 *   skill_conflict_detect  — trigger / description / tool competition conflicts
 *   skill_validate         — manifest & security validation (no hardcoded secrets)
 *   skill_health_report    — combined health status + recommended fixes
 *   skill_fix              — safe, backed-up auto-fixes (dry-run by default)
 *
 * @module skill-orchestrator
 */
import { homedir } from "node:os";
import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { runSkillAudit } from "./tools/skill-audit.js";
import { detectConflicts } from "./tools/conflict-detect.js";
import { runValidation } from "./tools/skill-validate.js";
import { generateHealthReport } from "./tools/skill-health-report.js";
import { applyFix } from "./tools/skill-fix.js";
function getSkillsDir(config) {
    const fromConfig = config.skillsDir;
    if (fromConfig && fromConfig.trim())
        return fromConfig;
    return `${homedir()}/.openclaw/workspace/skills`;
}
function num(config, key, fallback) {
    const v = config[key];
    return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
}
function bool(config, key) {
    return Boolean(config[key]);
}
export default definePluginEntry({
    id: "skill-orchestrator",
    name: "Skill Orchestrator",
    description: "Discovers, validates, audits, and resolves conflicts across all workspace skills. " +
        "Essential when you run many custom skills — keeps them healthy, conflict-free, and secret-safe.",
    register(api) {
        const config = (api.pluginConfig || {});
        // ──────────────────────────────────────────────────────────────
        // TOOL: skill_audit
        // ──────────────────────────────────────────────────────────────
        api.registerTool({
            name: "skill_audit",
            label: "Audit Skills",
            description: "Run a comprehensive audit of all skills in the workspace. Returns inventory, validation results, and missing dependencies.",
            parameters: Type.Object({
                skillsDir: Type.Optional(Type.String({ description: "Path to skills directory" })),
            }),
            async execute(_id, params) {
                const dir = params.skillsDir || getSkillsDir(config);
                const report = await runSkillAudit({ skillsDir: dir });
                const lines = [
                    "# 🦞 Skill Orchestrator — Audit Report",
                    "",
                    `**Directory:** ${report.skillsDirectory}`,
                    `**Total Skills:** ${report.totalSkills}`,
                    `**Critical Issues:** ${report.criticalIssues}`,
                    `**Warnings:** ${report.warnings}`,
                    "",
                    "## Skill Inventory",
                    "| Name | Triggers | Tools | Status |",
                    "|------|----------|-------|--------|",
                ];
                for (const skill of report.skills) {
                    const status = skill.hasError ? "❌ ERROR" : "✅ OK";
                    const tools = skill.requiredTools.join(", ") || "None";
                    lines.push(`| ${skill.name} | ${skill.triggers.length} | ${tools} | ${status} |`);
                }
                const missing = report.missingDependencies.filter((d) => !d.installed);
                if (missing.length) {
                    lines.push("", "## ❌ Missing Dependencies");
                    for (const dep of missing)
                        lines.push(`- **${dep.binary}** (required by: ${dep.requiredBy.join(", ")})`);
                }
                const failed = report.validationResults.filter((r) => !r.valid);
                if (failed.length) {
                    lines.push("", "## ❌ Validation Failures");
                    for (const v of failed)
                        lines.push(`- **${v.name}**: ${v.errors.join("; ")}`);
                }
                return { details: "", content: [{ type: "text", text: lines.join("\n") }] };
            },
        });
        // ──────────────────────────────────────────────────────────────
        // TOOL: skill_conflict_detect
        // ──────────────────────────────────────────────────────────────
        api.registerTool({
            name: "skill_conflict_detect",
            label: "Detect Conflicts",
            description: "Detect conflicts between skills: trigger overlaps, similar triggers, description clashes, tool competition, and name collisions.",
            parameters: Type.Object({
                skillsDir: Type.Optional(Type.String({ description: "Path to skills directory" })),
                similarityThreshold: Type.Optional(Type.Number({ description: "Similarity threshold (0.0-1.0)", minimum: 0, maximum: 1 })),
            }),
            async execute(_id, params) {
                const dir = params.skillsDir || getSkillsDir(config);
                const threshold = params.similarityThreshold ?? num(config, "similarityThreshold", 0.6);
                const audit = await runSkillAudit({ skillsDir: dir });
                const conflicts = detectConflicts({ skills: audit.skills, similarityThreshold: threshold });
                if (!conflicts.length) {
                    return { details: "", content: [{ type: "text", text: `✅ No conflicts detected! All ${audit.skills.length} skills are running smoothly.` }] };
                }
                const lines = ["# ⚔️ Skill Conflict Detection Report", "", `**Total Conflicts:** ${conflicts.length}`, ""];
                const buckets = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] };
                for (const c of conflicts)
                    buckets[c.severity].push(c);
                for (const sev of ["CRITICAL", "HIGH", "MEDIUM", "LOW"]) {
                    const list = buckets[sev];
                    if (!list.length)
                        continue;
                    lines.push(`## ${sev} (${list.length})`);
                    for (const c of list) {
                        lines.push(`### ${c.type}`, `- **Skills:** ${c.skills.join(", ")}`, `- **Issue:** ${c.message}`);
                        if (c.trigger)
                            lines.push(`- **Trigger:** ${c.trigger}`);
                        if (c.triggerA && c.triggerB)
                            lines.push(`- **Triggers:** "${c.triggerA}" ↔ "${c.triggerB}" (${c.similarity})`);
                        if (c.sharedTools)
                            lines.push(`- **Shared Tools:** ${c.sharedTools.join(", ")}`);
                        lines.push(`- **Fix:** ${c.fix}`, "");
                    }
                }
                return { details: "", content: [{ type: "text", text: lines.join("\n") }] };
            },
        });
        // ──────────────────────────────────────────────────────────────
        // TOOL: skill_validate
        // ──────────────────────────────────────────────────────────────
        api.registerTool({
            name: "skill_validate",
            label: "Validate Skills",
            description: "Validate all SKILL.md files in the workspace. Checks YAML syntax, required fields, trigger quality, and security (no hardcoded secrets).",
            parameters: Type.Object({
                skillsDir: Type.Optional(Type.String({ description: "Path to skills directory" })),
                strictMode: Type.Optional(Type.Boolean({ description: "Fail on warnings too" })),
            }),
            async execute(_id, params) {
                const dir = params.skillsDir || getSkillsDir(config);
                const strict = params.strictMode ?? bool(config, "strictMode");
                const report = await runValidation({ skillsDir: dir, strictMode: strict });
                const lines = [
                    "# 📋 Skill Validation Report",
                    "",
                    `**Total:** ${report.total} | ✅ Passed: ${report.passed} | ❌ Failed: ${report.failed}`,
                    "",
                ];
                for (const result of report.results) {
                    const icon = result.valid ? "✅" : "❌";
                    lines.push(`## ${icon} ${result.name}`, `**File:** ${result.filepath}`);
                    for (const e of result.errors)
                        lines.push(`- ❌ ${e}`);
                    for (const w of result.warnings)
                        lines.push(`- ⚠️ ${w}`);
                    for (const info of result.info)
                        lines.push(`- ℹ️ ${info}`);
                    lines.push("");
                }
                return { details: "", content: [{ type: "text", text: lines.join("\n") }] };
            },
        });
        // ──────────────────────────────────────────────────────────────
        // TOOL: skill_health_report
        // ──────────────────────────────────────────────────────────────
        api.registerTool({
            name: "skill_health_report",
            label: "Health Report",
            description: "Generate a comprehensive health report combining audit, validation, and conflict detection. Returns overall health and recommended fixes.",
            parameters: Type.Object({
                skillsDir: Type.Optional(Type.String({ description: "Path to skills directory" })),
                similarityThreshold: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
                strictMode: Type.Optional(Type.Boolean()),
            }),
            async execute(_id, params) {
                const dir = params.skillsDir || getSkillsDir(config);
                const threshold = params.similarityThreshold ?? num(config, "similarityThreshold", 0.6);
                const strict = params.strictMode ?? bool(config, "strictMode");
                const report = await generateHealthReport({ skillsDir: dir, similarityThreshold: threshold, strictMode: strict });
                const s = report.summary;
                const lines = [
                    "# 🏥 Skill Health Report",
                    "",
                    `**Healthy:** ${s.healthy ? "✅ YES" : "❌ NO"}`,
                    `**Generated:** ${report.generatedAt}`,
                    "",
                    "## Summary",
                    "| Metric | Value |",
                    "|--------|-------|",
                    `| Total Skills | ${s.totalSkills} |`,
                    `| Total Triggers | ${s.totalTriggers} |`,
                    `| Unique Tools | ${s.uniqueTools} |`,
                    `| Critical Issues | ${s.criticalCount} |`,
                    `| High Priority | ${s.highCount} |`,
                    `| Medium Priority | ${s.mediumCount} |`,
                    "",
                ];
                if (report.conflicts.length) {
                    lines.push(`## Conflicts (${report.conflicts.length})`);
                    for (const c of report.conflicts)
                        lines.push(`- **[${c.severity}]** ${c.type}: ${c.message}`);
                    lines.push("");
                }
                if (report.fixes.length) {
                    lines.push("## 🔧 Recommended Fixes");
                    for (const fix of report.fixes) {
                        const auto = fix.autoApplicable ? "(auto)" : "(manual)";
                        lines.push(`- **[${fix.type}]** ${auto} ${fix.description}`);
                        if (fix.patch)
                            lines.push(`  \`\`\`\n${fix.patch}\n\`\`\``);
                    }
                    lines.push("");
                }
                lines.push(report.summary.healthy ? "✅ All clear! Your skills are well-organized and conflict-free." : "⚠️ Issues detected. Review the conflicts and fixes above.");
                return { details: "", content: [{ type: "text", text: lines.join("\n") }] };
            },
        });
        // ──────────────────────────────────────────────────────────────
        // TOOL: skill_fix
        // ──────────────────────────────────────────────────────────────
        api.registerTool({
            name: "skill_fix",
            label: "Fix Skill Issues",
            description: "Apply automatic fixes to skill issues. Supports trigger refinement, priority assignment, and safe manifest corrections. Always backs up before modifying. Dry-run by default.",
            parameters: Type.Object({
                skillsDir: Type.Optional(Type.String({ description: "Path to skills directory" })),
                fixType: Type.String({ description: "REFINE_TRIGGER | ADD_PRIORITY | RENAME_SKILL | MERGE_SKILLS" }),
                target: Type.String({ description: "Target skill name(s), comma-separated" }),
                dryRun: Type.Optional(Type.Boolean({ description: "Preview changes without applying", default: true })),
            }),
            async execute(_id, params) {
                const dir = params.skillsDir || getSkillsDir(config);
                const isDry = params.dryRun ?? true;
                const result = await applyFix({
                    fix: {
                        type: params.fixType,
                        target: params.target,
                        description: `${params.fixType} → ${params.target}`,
                        autoApplicable: params.fixType === "ADD_PRIORITY",
                    },
                    skillsDir: dir,
                    dryRun: isDry,
                });
                const head = result.success ? "✅ Fix applied successfully" : "❌ Fix could not be applied automatically";
                const body = `**Action:** ${result.action}\n**Details:** ${result.details}` + (result.backupPath ? `\n**Backup:** ${result.backupPath}` : "");
                return { details: "", content: [{ type: "text", text: `${head}\n\n${body}` }] };
            },
        });
    },
});
//# sourceMappingURL=index.js.map