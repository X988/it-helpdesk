"use client";
export default function GlobalError({ reset }: { reset: () => void }) {
  return <html lang="ru"><body><main><h1>Сервис временно недоступен</h1><p>Повторите попытку позже или обратитесь к администратору.</p><button onClick={reset}>Повторить</button></main></body></html>;
}
