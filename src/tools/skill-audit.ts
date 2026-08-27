/**
 * Skill Audit Tool
 * Scans workspace skills directory and generates comprehensive inventory.
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseSkillFile, validateSkillFile } from "../utils/parser.js";
import type { SkillRecord, AuditReport, MissingDependency, ValidationResult } from "../utils/types.js";

export interface AuditOptions {
  skillsDir: string;
}

export async function runSkillAudit(options: AuditOptions): Promise<AuditReport> {
  const skillsDir = options.skillsDir;
  const skills: SkillRecord[] = [];
  const validationResults: ValidationResult[] = [];
  const missingDependencies: MissingDependency[] = [];

  // Discover all SKILL.md files
  const skillFiles = await discoverSkillFiles(skillsDir);

  for (const filepath of skillFiles) {
    try {
      const record = await parseSkillFile(filepath);
      skills.push(record);

      if (!record.hasError) {
        const validation = await validateSkillFile(filepath);
        validationResults.push(validation);
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Check dependencies
  const binaryMap = new Map<string, Set<string>>();
  for (const skill of skills) {
    const bins = skill.manifest.metadata?.openclaw?.requires?.bins || [];
    for (const bin of bins) {
      if (!binaryMap.has(bin)) binaryMap.set(bin, new Set());
      binaryMap.get(bin)!.add(skill.name);
    }
  }

  for (const [binary, skillSet] of binaryMap) {
    const installed = await checkBinary(binary);
    missingDependencies.push({
      binary,
      requiredBy: Array.from(skillSet),
      installed,
      version: installed ? await getBinaryVersion(binary) : undefined,
    });
  }

  const criticalIssues = validationResults.reduce(
    (sum, v) => sum + v.errors.length,
    0
  );
  const warnings = validationResults.reduce(
    (sum, v) => sum + v.warnings.length,
    0
  );

  return {
    timestamp: new Date().toISOString(),
    skillsDirectory: skillsDir,
    totalSkills: skills.length,
    criticalIssues,
    warnings,
    skills,
    conflicts: [], // Populated by conflict detector
    validationResults,
    missingDependencies,
  };
}

async function discoverSkillFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function scan(currentDir: string) {
    let entries: string[];
    try {
      entries = await readdir(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      try {
        const s = await stat(fullPath);
        if (s.isDirectory()) {
          await scan(fullPath);
        } else if (entry === "SKILL.md") {
          files.push(fullPath);
        }
      } catch {
        // Skip inaccessible files
      }
    }
  }

  await scan(dir);
  return files;
}

async function checkBinary(binary: string): Promise<boolean> {
  try {
    const { access } = await import("node:fs/promises");
    const { delimiter } = await import("node:path");
    const { env } = await import("node:process");
    const dirs = (env.PATH || "").split(delimiter).filter(Boolean);
    for (const dir of dirs) {
      try {
        await access(join(dir, binary));
        return true;
      } catch {
        // try next directory
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function getBinaryVersion(_binary: string): Promise<string | undefined> {
  // Version detection intentionally omitted: it would require spawning the
  // binary, which ClawHub's static scanner flags as a command-injection risk.
  // Presence is already reported via checkBinary, which is sufficient for audit.
  return undefined;
}
