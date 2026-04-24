/**
 * get-skill.ts — Tool: get_skill
 *
 * 获取指定 Skill 的完整 SKILL.md 内容。
 * 直接复用 @kb-skills/core 的 loadSkill()。
 */
import { loadSkill } from "@kb-skills/core";

export interface GetSkillInput {
  name: string;
}

export interface GetSkillResult {
  name: string;
  content: string | null;
  description: string;
  found: boolean;
}

export const getSkill = async (
  input: GetSkillInput,
): Promise<GetSkillResult> => {
  const skill = await loadSkill(input.name);
  if (!skill) {
    return { name: input.name, content: null, description: "", found: false };
  }
  return {
    name: skill.name,
    content: skill.content,
    description: skill.description,
    found: true,
  };
};
