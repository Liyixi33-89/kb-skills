import { loadSkill, parseSkillWorkflow } from '../packages/core/dist/index.js';

const skills = ['gen-frontend-code', 'gen-test-code', 'refactor', 'write-test', 'api-diff', 'bug-fix', 'code-review', 'gen-backend-code'];
let withWorkflow = 0;
for (const name of skills) {
  const skill = await loadSkill(name);
  const wf = parseSkillWorkflow(skill?.content ?? '');
  const hasWf = !!wf;
  if (hasWf) withWorkflow++;
  const steps = wf?.steps?.map(s => `[${s.type}]${s.id}`).join(' → ') ?? '—';
  console.log(`${hasWf ? '✅' : '❌'} ${name.padEnd(20)} steps=${wf?.steps?.length ?? 0}  ${steps}`);
}
console.log(`\n共 ${skills.length} 个 Skill，${withWorkflow} 个有 workflow`);
