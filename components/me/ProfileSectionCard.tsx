import type { ReactNode } from "react";

export function ProfileSectionCard({
  title,
  description,
  children,
  actions
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="panel stack">
      <header className="stack">
        <h2>{title}</h2>
        {description ? <p className="muted">{description}</p> : null}
      </header>
      {children}
      {actions ? <div className="actions">{actions}</div> : null}
    </section>
  );
}
