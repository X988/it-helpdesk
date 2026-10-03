import Link from "next/link";
export default function NotFound() { return <main id="content" className="shell"><section className="card"><h1>Страница не найдена</h1><p>Возможно, адрес неверный или у вас нет доступа к этой заявке.</p><Link href="/dashboard">Вернуться к заявкам</Link></section></main>; }
