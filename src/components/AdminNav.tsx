import Link from "next/link";

const LINKS = [
  { href: "/admin/users", label: "Пользователи" },
  { href: "/admin/categories", label: "Категории" },
  { href: "/admin/organizations", label: "Организации" },
  { href: "/admin/ad", label: "Active Directory" },
] as const;

/** Secondary navigation between admin sections. */
export default function AdminNav({ current }: { current?: string }) {
  return (
    <nav className="actionRow" aria-label="Администрирование">
      {LINKS.map((l) =>
        l.href === current ? (
          <span key={l.href} className="button" aria-current="page">
            {l.label}
          </span>
        ) : (
          <Link key={l.href} className="button secondary" href={l.href}>
            {l.label}
          </Link>
        ),
      )}
    </nav>
  );
}
