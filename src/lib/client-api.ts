const errors: Record<string, string> = {
  UNAUTHORIZED: "Сессия истекла. Войдите снова.", INVALID_CREDENTIALS: "Неверный email или пароль.", FORBIDDEN: "Недостаточно прав.",
  INVALID_ORIGIN: "Адрес сайта не совпадает с APP_URL. Обратитесь к администратору.", INVALID_INPUT: "Проверьте заполнение полей.",
  RATE_LIMITED: "Слишком много попыток. Повторите позже.", INVALID_TRANSITION: "Статус уже изменился или действие недоступно.",
  ALREADY_ASSIGNED: "Заявку уже взял другой специалист.", TICKET_FINISHED: "Заявка завершена. Изменения недоступны.",
  STORAGE_NOT_CONFIGURED: "Хранилище файлов ещё не настроено.", INVALID_FILE_SIZE: "Размер файла должен быть от 1 байта до 10 МБ.",
  INVALID_FILE_TYPE: "Допустимы PNG, JPEG, WebP, PDF и текстовые файлы.", INVALID_FILE_CONTENT: "Содержимое файла не соответствует его типу.",
  INVALID_FILE_COUNT: "Выберите от 1 до 5 файлов.", TICKET_FILE_LIMIT: "В одной заявке допускается до 20 файлов.",
  BODY_TOO_LARGE: "Общий размер загрузки слишком большой.", EMAIL_EXISTS: "Этот email уже используется.", CATEGORY_EXISTS: "Категория уже существует.",
  CANNOT_DISABLE_SELF: "Нельзя отключить свой аккаунт или снять с себя роль администратора.", TELEGRAM_NOT_CONFIGURED: "Telegram ещё не настроен.",
};
export async function api<T>(url: string, method = "POST", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, ...(body instanceof FormData ? { body } : body !== undefined ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(errors[data.error] ?? "Не удалось выполнить действие. Повторите позже.");
  return data as T;
}
export function errorText(error: unknown) { return error instanceof Error ? error.message : "Не удалось связаться с сервером."; }
