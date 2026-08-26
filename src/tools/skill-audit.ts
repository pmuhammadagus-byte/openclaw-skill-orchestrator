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
    const { execSync } = await import("node:child_process");
    execSync(`which ${binary}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function getBinaryVersion(binary: string): Promise<string | undefined> {
  try {
    const { execSync } = await import("node:child_process");
    const version = execSync(`${binary} --version 2>/dev/null || ${binary} -version 2>/dev/null || ${binary} -v 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 5000,
    })
      .split("\n")[0]
      .trim();
    return version || "installed";
  } catch {
    return undefined;
  }
}
