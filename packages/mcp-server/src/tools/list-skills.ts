/**
 * list-skills.ts — Tool: list_skills
 *
 * 列出所有内置 Skills 的名称和描述。
 * 直接复用 @kb-skills/core 的 listSkills()。
 */
import { listSkills } from "@kb-skills/core";

export interface ListSkillsResult {
  skills: Array<{
    name: string;
    description: string;
  }>;
  total: number;
}

export const listAllSkills = async (): Promise<ListSkillsResult> => {
  const skills = await listSkills();
  return {
    skills: skills.map((s) => ({ name: s.name, description: s.description })),
    total: skills.length,
  };
};
