import { formatPerson, roleLabel } from "@/lib/labels";

type Contact = {
  id?: string;
  name: string;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string;
  source?: string;
};

export default function SupportContacts({
  contacts,
  extra = [],
  title = "Контакты поддержки",
}: {
  contacts: Contact[];
  extra?: Contact[];
  title?: string;
}) {
  const all = [...contacts, ...extra];
  if (all.length === 0) {
    return (
      <div className="card">
        <h3>{title}</h3>
        <p className="muted">Контакты пока не указаны. Обратитесь к своему IT-специалисту.</p>
      </div>
    );
  }
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <ul className="contactList">
        {all.map((c, i) => (
          <li key={c.id ?? `${c.name}-${i}`}>
            <b>{formatPerson(c.name, c.username)}</b>
            {c.role && <span className="muted"> · {roleLabel[c.role as keyof typeof roleLabel] ?? c.role}</span>}
            <div className="muted">
              {c.email && (
                <>
                  <a href={`mailto:${c.email}`}>{c.email}</a>
                  {c.phone ? " · " : ""}
                </>
              )}
              {c.phone && <span>{c.phone}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
