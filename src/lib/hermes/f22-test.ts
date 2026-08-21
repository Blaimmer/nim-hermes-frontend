// Test rápido F2.2: valida login + listAllProfileSessions + getLatestSessionMessages
// contra hermes serve real (:9119), replicando lo que hace SessionList.tsx.
import { login, setServeBaseUrl } from './api-client';
import { listAllProfileSessions, getLatestSessionMessages } from './sessions';

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

  const page = await listAllProfileSessions(50, 1);
  console.log('✅ listAllProfileSessions: total =', page.total, '| items =', page.sessions.length);
  const s = page.sessions[0];
  if (s) {
    console.log('   primera sesión:', JSON.stringify({
      id: s.id.slice(0, 12) + '…',
      title: s.title?.slice(0, 40),
      preview: (s.preview ?? '').slice(0, 60),
      message_count: s.message_count,
      model: s.model,
      source: s.source,
      is_active: s.is_active,
      last_active: s.last_active,
      started_at: s.started_at,
      archived: s.archived
    }, null, 1));
    const msgs = await getLatestSessionMessages(s.id);
    console.log('✅ getLatestSessionMessages:', msgs.messages.length, 'msgs | session_id =', msgs.session_id.slice(0, 12) + '…');
    const m = msgs.messages[0];
    if (m) console.log('   primer msg:', JSON.stringify({ role: m.role, ts: m.timestamp, contentType: typeof m.content }, null, 1));
  } else {
    console.log('⚠️ sin sesiones listadas');
  }
  console.log('TEST F2.2 COMPLETADO');
}

main().catch(e => {
  console.error('TEST F2.2 FALLÓ:', e);
  process.exit(1);
});
