// Test rápido F2.6: valida login + getStarmapGraph + getSkills contra hermes
// serve real (:9119), replicando lo que hace MemoryGraphPane.tsx.
import { login, setServeBaseUrl } from './api-client';
import { getSkills, getStarmapGraph } from './skills';

async function main() {
  const base = process.env.NIM_SERVE_URL ?? 'http://127.0.0.1:9119';
  const user = process.env.NIM_SERVE_USER ?? 'nim';
  const pass = process.env.NIM_SERVE_PASS ?? 'Nim6444dd09728d5011';
  setServeBaseUrl(base);

  console.log(`Conectando a ${base}...`);
  try {
    await login(user, pass);
    console.log('✅ login OK');
  } catch (e) {
    console.log('⚠️ login falló:', (e as Error).message.slice(0, 120));
    process.exit(1);
  }

  const graph = await getStarmapGraph();
  const nodes = graph.nodes ?? [];
  const skillNodes = nodes.filter(n => n.kind === 'skill').length;
  const memNodes = nodes.filter(n => n.kind === 'memory').length;
  const pinned = nodes.filter(n => n.pinned).length;
  console.log(`✅ getStarmapGraph: nodes=${nodes.length} (skills=${skillNodes}, memoria=${memNodes}, pinned=${pinned})`);
  console.log(`   edges=${(graph.edges ?? []).length} | clusters=${(graph.clusters ?? []).length} | memoryCards=${(graph.memory ?? []).length}`);
  const n0 = nodes[0];
  if (n0) console.log('   nodo 0:', JSON.stringify({ id: n0.id.slice(0, 16) + '…', label: n0.label, kind: n0.kind, category: n0.category, useCount: n0.useCount, state: n0.state, pinned: n0.pinned }));
  const c0 = (graph.clusters ?? [])[0];
  if (c0) console.log('   cluster 0:', JSON.stringify(c0));
  const m0 = (graph.memory ?? [])[0];
  if (m0) console.log('   card 0:', JSON.stringify({ source: m0.source, title: m0.title, bodyLen: (m0.body ?? '').length }));

  const skills = await getSkills();
  console.log(`✅ getSkills: total=${skills.length}`);
  const cats = new Map<string, number>();
  for (const s of skills) cats.set(s.category ?? 'sin categoría', (cats.get(s.category ?? 'sin categoría') ?? 0) + 1);
  console.log('   categorías:', [...cats.entries()].map(([c, n]) => `${c}=${n}`).join(', '));
  const s0 = skills[0];
  if (s0) console.log('   skill 0:', JSON.stringify({ name: s0.name, category: s0.category, enabled: s0.enabled, provenance: s0.provenance, desc: (s0.description ?? '').slice(0, 60) }));

  console.log('TEST F2.6 COMPLETADO');
}

main().catch(e => {
  console.error('TEST F2.6 FALLÓ:', e);
  process.exit(1);
});
