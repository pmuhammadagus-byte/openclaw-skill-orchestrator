/**
 * Skill Validation Tool
 * Validates all SKILL.md files in the workspace.
 */
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { validateSkillFile } from "../utils/parser.js";
export async function runValidation(options) {
    const { skillsDir, strictMode } = options;
    const results = [];
    const skillFiles = await discoverSkillFiles(skillsDir);
    for (const filepath of skillFiles) {
        try {
            const result = await validateSkillFile(filepath);
            if (strictMode && result.warnings.length > 0) {
                result.valid = false;
                result.errors.push(...result.warnings.map((w) => `[STRICT] ${w}`));
                result.warnings = [];
            }
            results.push(result);
        }
        catch (e) {
            results.push({
                valid: false,
                name: "UNKNOWN",
                filepath,
                errors: [`Failed to validate: ${e.message}`],
                warnings: [],
                info: [],
            });
        }
    }
    const passed = results.filter((r) => r.valid).length;
    const failed = results.filter((r) => !r.valid).length;
    return { total: results.length, passed, failed, results };
}
async function discoverSkillFiles(dir) {
    const files = [];
    async function scan(currentDir) {
        let entries;
        try {
            entries = await readdir(currentDir);
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const fullPath = join(currentDir, entry);
            try {
                const s = await stat(fullPath);
                if (s.isDirectory()) {
                    await scan(fullPath);
                }
                else if (entry === "SKILL.md") {
                    files.push(fullPath);
                }
            }
            catch {
                // Skip
            }
        }
    }
    await scan(dir);
    return files;
}
//# sourceMappingURL=skill-validate.js.map