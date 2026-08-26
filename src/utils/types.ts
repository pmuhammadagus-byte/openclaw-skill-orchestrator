/**
 * Shared type definitions for Skill Orchestrator Plugin
 */

export interface SkillManifest {
  name: string;
  description: string;
  version?: string;
  triggers: string[];
  required_tools?: string[];
  metadata?: {
    openclaw?: {
      category?: string;
      priority?: 'highest' | 'high' | 'normal' | 'low';
      auto_load?: boolean;
      requires?: {
        bins?: string[];
        env?: Record<string, string>;
      };
      env?: Record<string, string>;
    };
  };
}

export interface SkillRecord {
  name: string;
  description: string;
  triggers: string[];
  requiredTools: string[];
  filepath: string;
  manifest: SkillManifest;
  contentLength: number;
  lastModified: string;
  hasError?: boolean;
  errorMessage?: string;
}

export interface ValidationResult {
  valid: boolean;
  name: string;
  filepath: string;
  errors: string[];
  warnings: string[];
  info: string[];
}

export interface Conflict {
  type: 'EXACT_OVERLAP' | 'SIMILAR_TRIGGER' | 'DESCRIPTION_CLASH' | 'TOOL_COMPETITION' | 'NAME_COLLISION';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  skills: string[];
  trigger?: string;
  triggerA?: string;
  triggerB?: string;
  similarity?: string;
  sharedTools?: string[];
  message: string;
  fix: string;
}

export interface AuditReport {
  timestamp: string;
  skillsDirectory: string;
  totalSkills: number;
  criticalIssues: number;
  warnings: number;
  skills: SkillRecord[];
  conflicts: Conflict[];
  validationResults: ValidationResult[];
  missingDependencies: MissingDependency[];
}

export interface MissingDependency {
  binary: string;
  requiredBy: string[];
  installed: boolean;
  version?: string;
}

export interface FixAction {
  type: 'REFINE_TRIGGER' | 'MERGE_SKILLS' | 'ADD_PRIORITY' | 'RENAME_SKILL' | 'INSTALL_BINARY';
  target: string;
  description: string;
  autoApplicable: boolean;
  patch?: string;
}

export interface HealthReport {
  summary: {
    totalSkills: number;
    totalTriggers: number;
    uniqueTools: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    healthy: boolean;
  };
  skills: SkillRecord[];
  conflicts: Conflict[];
  fixes: FixAction[];
  generatedAt: string;
}
