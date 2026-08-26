/**
 * SKILL.md parser and validator utilities
 */
import { readFile, stat } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
const NAME_PATTERN = /^[a-z0-9-]+$/;
const SECRET_PATTERNS = [
    /sk-[a-zA-Z0-9]{20,}/,
    /AKIA[0-9A-Z]{16}/,
    /[a-zA-Z0-9_-]*api[_-]?key[a-zA-Z0-9_-]*[:=]\s*["']?[a-zA-Z0-9]{16,}["']?/i,
    /password\s*[:=]\s*["'][^"']{8,}["']/i,
    /token\s*[:=]\s*["'][^"']{16,}["']/i,
    /secret\s*[:=]\s*["'][^"']{8,}["']/i,
];
export async function parseSkillFile(filepath) {
    const content = await readFile(filepath, "utf-8");
    const stats = await stat(filepath);
    if (!content.startsWith("---")) {
        return createErrorRecord(filepath, content, stats, "File does not start with YAML frontmatter (---)");
    }
    const parts = content.split("---", 3);
    if (parts.length < 3) {
        return createErrorRecord(filepath, content, stats, "Invalid frontmatter: missing closing ---");
    }
    let manifest;
    try {
        manifest = parseYaml(parts[1]);
    }
    catch (e) {
        return createErrorRecord(filepath, content, stats, `YAML parse error: ${e.message}`);
    }
    return {
        name: manifest.name || "UNKNOWN",
        description: manifest.description || "",
        triggers: manifest.triggers || [],
        requiredTools: manifest.required_tools || [],
        filepath,
        manifest,
        contentLength: content.length,
        lastModified: stats.mtime.toISOString(),
    };
}
function createErrorRecord(filepath, content, stats, errorMessage) {
    return {
        name: "PARSE_ERROR",
        description: errorMessage,
        triggers: [],
        requiredTools: [],
        filepath,
        manifest: { name: "PARSE_ERROR", description: "", triggers: [] },
        contentLength: content.length,
        lastModified: stats.mtime.toISOString(),
        hasError: true,
        errorMessage,
    };
}
export async function validateSkillFile(filepath) {
    const content = await readFile(filepath, "utf-8");
    const record = await parseSkillFile(filepath);
    return validateSkill(record, content);
}
export function validateSkill(record, content) {
    const result = {
        valid: true,
        name: record.name,
        filepath: record.filepath,
        errors: [],
        warnings: [],
        info: [],
    };
    // Name validation
    if (!record.name || record.name === "UNKNOWN" || record.name === "PARSE_ERROR") {
        result.valid = false;
        result.errors.push("Missing or invalid skill name");
    }
    else if (!NAME_PATTERN.test(record.name)) {
        result.warnings.push(`Name '${record.name}' should be lowercase letters, digits, and hyphens only`);
    }
    else if (record.name.length > 50) {
        result.warnings.push(`Name '${record.name}' is very long (${record.name.length} chars)`);
    }
    // Description validation
    if (!record.description) {
        result.warnings.push("Description is empty");
    }
    else if (record.description.length > 160) {
        result.warnings.push(`Description is ${record.description.length} chars (recommended: under 160)`);
    }
    else if (record.description.length < 20) {
        result.warnings.push(`Description is only ${record.description.length} chars (recommended: at least 20)`);
    }
    // Triggers validation
    if (!record.triggers || record.triggers.length === 0) {
        result.valid = false;
        result.errors.push("No triggers defined");
    }
    else {
        if (record.triggers.length < 3) {
            result.warnings.push(`Only ${record.triggers.length} triggers (recommended: 3-20)`);
        }
        else if (record.triggers.length > 20) {
            result.warnings.push(`${record.triggers.length} triggers (recommended: max 20)`);
        }
        const broadWords = new Set(["help", "do", "run", "make", "create", "get", "fix", "check"]);
        for (const trigger of record.triggers) {
            const trimmed = trigger.trim().toLowerCase();
            if (trimmed.length < 3) {
                result.warnings.push(`Trigger '${trigger}' is very short (may cause false activations)`);
            }
            else if (trimmed.length > 100) {
                result.warnings.push(`Trigger '${trigger}' is ${trimmed.length} chars (very long)`);
            }
            if (broadWords.has(trimmed)) {
                result.warnings.push(`Trigger '${trigger}' is too broad, may cause false activations`);
            }
        }
    }
    // Secret detection
    for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(content)) {
            result.valid = false;
            result.errors.push("Potential hardcoded secret detected in skill file");
            break;
        }
    }
    // Metadata validation
    const metadata = record.manifest.metadata;
    if (!metadata) {
        result.info.push("No metadata block (recommended for advanced features)");
    }
    else if (metadata.openclaw) {
        const oc = metadata.openclaw;
        if (oc.requires?.bins && !Array.isArray(oc.requires.bins)) {
            result.warnings.push("metadata.openclaw.requires.bins should be an array");
        }
        if (oc.requires?.env && typeof oc.requires.env !== "object") {
            result.warnings.push("metadata.openclaw.requires.env should be an object");
        }
    }
    // Instruction block check
    const parts = content.split("---", 3);
    const body = parts[2]?.trim() || "";
    if (!body) {
        result.warnings.push("No instruction body found after frontmatter");
    }
    else {
        const requiredSections = ["## Role", "## Rules"];
        for (const section of requiredSections) {
            if (!body.includes(section)) {
                result.info.push(`Recommended section missing: ${section}`);
            }
        }
    }
    return result;
}
//# sourceMappingURL=parser.js.map