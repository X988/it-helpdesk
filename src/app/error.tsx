"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="content" className="shell"><section className="card"><h1>Не удалось загрузить страницу</h1><p>Повторите попытку. Если ошибка сохраняется, администратор должен проверить приложение и соединение с базой данных.</p><button onClick={reset}>Повторить</button></section></main>;
}
