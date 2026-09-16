export default function Home() {
  return (
    <main className="shell">
      <p className="muted">INTERNAL SERVICE DESK</p>
      <h1>IT Help Desk</h1>
      <p className="muted">Заявки, коммуникация и контроль работы IT-поддержки в одном интерфейсе.</p>
      <section className="grid" style={{ marginTop: 28 }}>
        <article className="card"><h2>Новая заявка</h2><p className="muted">Опишите проблему, выберите категорию и приложите скриншоты.</p></article>
        <article className="card"><h2>Мои заявки</h2><p className="muted">Следите за статусом и отвечайте специалисту.</p></article>
        <article className="card"><h2>IT очередь</h2><p className="muted">Рабочее место специалистов поддержки.</p></article>
      </section>
    </main>
  );
}
