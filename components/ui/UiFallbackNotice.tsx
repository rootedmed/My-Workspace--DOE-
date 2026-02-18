import Link from "next/link";

type UiFallbackNoticeProps = {
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export function UiFallbackNotice({
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel
}: UiFallbackNoticeProps) {
  return (
    <section className="panel stack">
      <p className="eyebrow">Feature Rollout</p>
      <h1>{title}</h1>
      <p className="muted">{description}</p>
      <div className="actions">
        <Link className="button-link" href={primaryHref}>
          {primaryLabel}
        </Link>
        {secondaryHref && secondaryLabel ? (
          <Link className="button-link ghost" href={secondaryHref}>
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
